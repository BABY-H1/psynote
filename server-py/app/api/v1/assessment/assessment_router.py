"""
Assessment core router — 镜像 ``server/src/modules/assessment/assessment.routes.ts`` (114 行).

挂在 ``/api/orgs/{org_id}/assessments`` prefix. 6 个 endpoint:

  GET    /                         — 列表 (rejectClient, ?includeDeleted=true)
  GET    /{assessment_id}          — 详情 (含 scales + dimensionNameMap)
  POST   /                         — 创建 (org_admin or counselor)
  PATCH  /{assessment_id}          — 更新 (admin/counselor)
  DELETE /{assessment_id}          — 软删除 (admin/counselor)
  POST   /{assessment_id}/restore  — 恢复 (org_admin only)

RBAC 守门 (镜像 Node ``requireRole(...)``):
  - GET endpoints: 任意 staff (rejectClient).
  - POST/PATCH/DELETE: ``role ∈ {org_admin, counselor}``.
  - restore: ``role == org_admin``.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, asc, delete, desc, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.schemas import (
    AssessmentCreateRequest,
    AssessmentDetail,
    AssessmentRow,
    AssessmentScaleRef,
    AssessmentUpdateRequest,
)
from app.core.database import get_db
from app.db.models.assessment_scales import AssessmentScale
from app.db.models.assessments import Assessment
from app.db.models.scale_dimensions import ScaleDimension
from app.db.models.scales import Scale
from app.lib.errors import NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import (
    reject_client as _reject_client,
)
from app.middleware.role_guards import (
    require_admin as _require_org_admin,
)
from app.middleware.role_guards import (
    require_admin_or_counselor as _require_admin_or_counselor,
)

router = APIRouter()


def _generate_share_token() -> str:
    """8 字节 → 16 字符 hex (镜像 Node ``crypto.randomBytes(8).toString('hex')``)."""
    return secrets.token_hex(8)


def _orm_to_row(a: Assessment) -> AssessmentRow:
    """ORM Assessment → AssessmentRow."""
    return AssessmentRow(
        id=str(a.id),
        org_id=str(a.org_id),
        title=a.title,
        description=a.description,
        assessment_type=a.assessment_type or "screening",
        demographics=list(a.demographics or []),
        blocks=list(a.blocks or []),
        screening_rules=dict(a.screening_rules or {}),
        collect_mode=a.collect_mode or "anonymous",
        result_display=dict(a.result_display or {}),
        share_token=a.share_token,
        allow_client_report=bool(a.allow_client_report),
        status=a.status or "draft",
        is_active=bool(a.is_active),
        created_by=str(a.created_by) if a.created_by else None,
        deleted_at=a.deleted_at,
        created_at=getattr(a, "created_at", None),
        updated_at=getattr(a, "updated_at", None),
    )


# ─── routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[AssessmentRow])
async def list_assessments(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
) -> list[AssessmentRow]:
    """列出本 org 的 assessments. 镜像 assessment.routes.ts:14-18."""
    _reject_client(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    conditions: list[Any] = [Assessment.org_id == org_uuid]
    if not include_deleted:
        conditions.append(Assessment.deleted_at.is_(None))

    q = select(Assessment).where(and_(*conditions)).order_by(desc(Assessment.created_at))
    rows = (await db.execute(q)).scalars().all()
    return [_orm_to_row(a) for a in rows]


@router.get("/{assessment_id}", response_model=AssessmentDetail)
async def get_assessment(
    org_id: str,
    assessment_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentDetail:
    """单个 assessment 详情, 含关联 scales + dimensionNameMap.

    镜像 assessment.service.ts:20-63. 三段查询 (assessment / scales+ join / dimensions).
    """
    _reject_client(org)

    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    a_q = select(Assessment).where(Assessment.id == aid).limit(1)
    assessment = (await db.execute(a_q)).scalar_one_or_none()
    if assessment is None:
        raise NotFoundError("Assessment", assessment_id)

    # 关联 scales (assessment_scales JOIN scales, 按 sortOrder)
    s_q = (
        select(AssessmentScale.scale_id, AssessmentScale.sort_order, Scale)
        .join(Scale, Scale.id == AssessmentScale.scale_id)
        .where(AssessmentScale.assessment_id == aid)
        .order_by(asc(AssessmentScale.sort_order))
    )
    scale_rows = (await db.execute(s_q)).all()

    scales: list[AssessmentScaleRef] = []
    scale_ids: list[uuid.UUID] = []
    for _scale_id, sort_order, scale in scale_rows:
        scales.append(
            AssessmentScaleRef(
                id=str(scale.id),
                title=scale.title,
                description=scale.description,
                sort_order=sort_order,
            )
        )
        scale_ids.append(scale.id)

    # 关联维度 (用于 dimensionNameMap)
    dimension_name_map: dict[str, str] = {}
    if scale_ids:
        d_q = select(ScaleDimension.id, ScaleDimension.name).where(
            or_(*[ScaleDimension.scale_id == sid for sid in scale_ids])
        )
        dim_rows = (await db.execute(d_q)).all()
        for did, dname in dim_rows:
            dimension_name_map[str(did)] = dname

    base = _orm_to_row(assessment)
    return AssessmentDetail(
        **base.model_dump(by_alias=False),
        scales=scales,
        dimension_name_map=dimension_name_map,
    )


@router.post("/", response_model=AssessmentDetail, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    org_id: str,
    body: AssessmentCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentDetail:
    """创建 assessment (admin/counselor). 镜像 assessment.routes.ts:27-69 + service:65-119.

    校验: 至少一个 scale (via scaleIds 或 blocks 的 scale 块).
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    # 至少一个 scale (镜像 routes.ts:43-50)
    blocks = body.blocks or []
    has_scale_in_blocks = any(b.get("type") == "scale" and b.get("scaleId") for b in blocks)
    if not has_scale_in_blocks and not body.scale_ids:
        raise ValidationError("At least one scale is required (via blocks or scaleIds)")

    # 决议 scale_ids (优先 body.scale_ids, 否则从 blocks 抽)
    scale_ids_from_blocks = [
        str(b["scaleId"]) for b in blocks if b.get("type") == "scale" and b.get("scaleId")
    ]
    final_scale_ids: list[str] = body.scale_ids or scale_ids_from_blocks

    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    share_token = _generate_share_token()

    try:
        a = Assessment(
            org_id=org_uuid,
            title=body.title,
            description=body.description,
            assessment_type=body.assessment_type or "screening",
            demographics=body.demographics or [],
            blocks=body.blocks or [],
            screening_rules=body.screening_rules or {},
            collect_mode=body.collect_mode or "anonymous",
            status=body.status or "active",
            result_display=body.result_display
            or {
                "mode": "custom",
                "show": [
                    "totalScore",
                    "riskLevel",
                    "dimensionScores",
                    "interpretation",
                    "advice",
                    "aiInterpret",
                ],
            },
            share_token=share_token,
            created_by=user_uuid,
        )
        db.add(a)
        await db.flush()  # 取 a.id

        # 关联 scales (junction table)
        if final_scale_ids:
            insert_rows = [
                {
                    "assessment_id": a.id,
                    "scale_id": parse_uuid_or_raise(sid, field="scaleId"),
                    "sort_order": idx,
                }
                for idx, sid in enumerate(final_scale_ids)
            ]
            await db.execute(insert(AssessmentScale).values(insert_rows))

        await db.commit()
    except ValidationError:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="assessments",
        resource_id=str(a.id),
        ip_address=request.client.host if request.client else None,
    )

    # 复用 GET 详情逻辑构造返回
    return await get_assessment(org_id, str(a.id), org, db)


@router.patch("/{assessment_id}", response_model=AssessmentDetail)
async def update_assessment(
    org_id: str,
    assessment_id: str,
    body: AssessmentUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentDetail:
    """更新 assessment (admin/counselor). 镜像 assessment.routes.ts:72-93 + service:121-173."""
    _require_admin_or_counselor(org)

    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    q = select(Assessment).where(Assessment.id == aid).limit(1)
    a = (await db.execute(q)).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Assessment", assessment_id)

    # 合并 fields (略去 scale_ids, 单独处理)
    has_scalar_update = False
    if body.title is not None:
        a.title = body.title
        has_scalar_update = True
    if body.description is not None:
        a.description = body.description
        has_scalar_update = True
    if body.assessment_type is not None:
        a.assessment_type = body.assessment_type
        has_scalar_update = True
    if body.demographics is not None:
        a.demographics = body.demographics
        has_scalar_update = True
    if body.blocks is not None:
        a.blocks = body.blocks
        has_scalar_update = True
    if body.screening_rules is not None:
        a.screening_rules = body.screening_rules
        has_scalar_update = True
    if body.collect_mode is not None:
        a.collect_mode = body.collect_mode
        has_scalar_update = True
    if body.result_display is not None:
        a.result_display = body.result_display
        has_scalar_update = True
    if body.status is not None:
        a.status = body.status
        has_scalar_update = True
    if body.is_active is not None:
        a.is_active = body.is_active
        has_scalar_update = True

    # scale_ids 决议 (优先 body.scale_ids, 否则从 blocks 抽)
    resolved_scale_ids: list[str] | None = body.scale_ids
    if body.blocks is not None and body.scale_ids is None:
        resolved_scale_ids = [
            str(b["scaleId"]) for b in body.blocks if b.get("type") == "scale" and b.get("scaleId")
        ]

    if has_scalar_update:
        a.updated_at = datetime.now(UTC)

    if resolved_scale_ids is not None:
        # 替换关联
        await db.execute(delete(AssessmentScale).where(AssessmentScale.assessment_id == aid))
        if resolved_scale_ids:
            insert_rows = [
                {
                    "assessment_id": aid,
                    "scale_id": parse_uuid_or_raise(sid, field="scaleId"),
                    "sort_order": idx,
                }
                for idx, sid in enumerate(resolved_scale_ids)
            ]
            await db.execute(insert(AssessmentScale).values(insert_rows))

    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="assessments",
        resource_id=assessment_id,
        ip_address=request.client.host if request.client else None,
    )

    return await get_assessment(org_id, assessment_id, org, db)


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment(
    org_id: str,
    assessment_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """软删除 (设 deleted_at). 镜像 assessment.routes.ts:96-103 + service:175-185."""
    _require_admin_or_counselor(org)

    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    q = (
        select(Assessment)
        .where(and_(Assessment.id == aid, Assessment.deleted_at.is_(None)))
        .limit(1)
    )
    a = (await db.execute(q)).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Assessment", assessment_id)

    a.deleted_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="assessments",
        resource_id=assessment_id,
        ip_address=request.client.host if request.client else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{assessment_id}/restore", response_model=AssessmentRow)
async def restore_assessment(
    org_id: str,
    assessment_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentRow:
    """恢复 (清 deleted_at) (org_admin only). 镜像 assessment.routes.ts:106-113."""
    _require_org_admin(org)

    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    q = select(Assessment).where(Assessment.id == aid).limit(1)
    a = (await db.execute(q)).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Assessment", assessment_id)

    a.deleted_at = None
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="assessments",
        resource_id=assessment_id,
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(a)


__all__ = ["router"]
