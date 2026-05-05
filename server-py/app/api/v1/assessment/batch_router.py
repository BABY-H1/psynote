"""
Batch router — 镜像 ``server/src/modules/assessment/batch.routes.ts`` (67 行).

挂在 ``/api/orgs/{org_id}/assessment-batches`` prefix. 4 个 endpoint:

  GET   /                   — 列表 (任意 staff)
  GET   /{batch_id}         — 详情 (含实时 stats: completed + riskDistribution)
  POST  /                   — 创建 (org_admin only)
  PATCH /{batch_id}/close   — 关闭批次 (org_admin only)

业务语义: 一个 batch = 一次批量发放. ``stats.total`` 在创建时记目标人数, ``completed``
+ ``riskDistribution`` 由 ``getBatchById`` 实时聚合 ``assessment_results.batch_id``.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.schemas import (
    BatchCreateRequest,
    BatchDetail,
    BatchRow,
)
from app.core.database import get_db
from app.db.models.assessment_batches import AssessmentBatch
from app.db.models.assessment_results import AssessmentResult
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _parse_uuid(value: str, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"{field} 不是合法 UUID") from exc


def _reject_client(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")


def _require_org_admin(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")


def _orm_to_row(b: AssessmentBatch) -> BatchRow:
    return BatchRow(
        id=str(b.id),
        org_id=str(b.org_id),
        assessment_id=str(b.assessment_id),
        title=b.title,
        target_type=b.target_type,
        target_config=dict(b.target_config or {}),
        deadline=b.deadline,
        status=b.status or "active",
        stats=dict(b.stats or {}),
        created_by=str(b.created_by) if b.created_by else None,
        created_at=getattr(b, "created_at", None),
    )


@router.get("/", response_model=list[BatchRow])
async def list_batches(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BatchRow]:
    """列表 (本 org). 镜像 batch.service.ts:7-13."""
    _reject_client(org)
    org_uuid = _parse_uuid(org_id, "orgId")

    q = (
        select(AssessmentBatch)
        .where(AssessmentBatch.org_id == org_uuid)
        .order_by(desc(AssessmentBatch.created_at))
    )
    rows = (await db.execute(q)).scalars().all()
    return [_orm_to_row(b) for b in rows]


@router.get("/{batch_id}", response_model=BatchDetail)
async def get_batch(
    org_id: str,
    batch_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BatchDetail:
    """详情 + 实时 stats. 镜像 batch.service.ts:15-44."""
    _reject_client(org)

    bid = _parse_uuid(batch_id, "batchId")
    q = select(AssessmentBatch).where(AssessmentBatch.id == bid).limit(1)
    b = (await db.execute(q)).scalar_one_or_none()
    if b is None:
        raise NotFoundError("AssessmentBatch", batch_id)

    # 实时聚合 results.batch_id (含 risk distribution)
    r_q = select(AssessmentResult).where(AssessmentResult.batch_id == bid)
    results = list((await db.execute(r_q)).scalars().all())

    risk_distribution: dict[str, int] = {}
    for r in results:
        level = r.risk_level or "unknown"
        risk_distribution[level] = risk_distribution.get(level, 0) + 1

    base_stats: dict[str, Any] = dict(b.stats or {})
    stats: dict[str, Any] = {
        "total": base_stats.get("total", 0),
        "completed": len(results),
        "riskDistribution": risk_distribution,
    }

    base_dict = _orm_to_row(b).model_dump(by_alias=False)
    base_dict["stats"] = stats  # 覆盖 BatchRow 的 stats (默认是 b.stats raw)
    return BatchDetail(**base_dict)


@router.post("/", response_model=BatchRow, status_code=status.HTTP_201_CREATED)
async def create_batch(
    org_id: str,
    body: BatchCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BatchRow:
    """创建 (org_admin only). 镜像 batch.routes.ts:25-55 + service:46-77.

    注: Node 端会 fire-and-forget ``notifyOrgAdmins(...)``; Phase 3 简化, audit 替代.
    """
    _require_org_admin(org)

    org_uuid = _parse_uuid(org_id, "orgId")
    user_uuid = _parse_uuid(user.id, "userId")
    aid = _parse_uuid(body.assessment_id, "assessmentId")

    try:
        b = AssessmentBatch(
            org_id=org_uuid,
            assessment_id=aid,
            title=body.title,
            target_type=body.target_type,
            target_config=body.target_config or {},
            deadline=body.deadline,
            status="active",
            stats={"total": body.total_targets},
            created_by=user_uuid,
        )
        db.add(b)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="assessment_batches",
        resource_id=str(b.id),
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(b)


@router.patch("/{batch_id}/close", response_model=BatchRow)
async def close_batch(
    org_id: str,
    batch_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BatchRow:
    """关闭 batch (org_admin only). 镜像 batch.routes.ts:59-65 + service:79-87."""
    _require_org_admin(org)

    bid = _parse_uuid(batch_id, "batchId")
    q = select(AssessmentBatch).where(AssessmentBatch.id == bid).limit(1)
    b = (await db.execute(q)).scalar_one_or_none()
    if b is None:
        raise NotFoundError("AssessmentBatch", batch_id)

    b.status = "closed"
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="assessment_batches",
        resource_id=batch_id,
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(b)


__all__ = ["router"]
