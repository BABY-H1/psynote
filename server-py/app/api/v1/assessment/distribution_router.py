"""
Distribution router — 镜像 ``server/src/modules/assessment/distribution.routes.ts`` (58 行).

挂在 ``/api/orgs/{org_id}/assessments/{assessment_id}/distributions`` prefix.
3 个 endpoint:

  GET   /                                  — 列表 (任意 staff)
  POST  /                                  — 创建分发任务 (admin/counselor)
  PATCH /{distribution_id}/status          — 更新状态 (admin/counselor)

业务语义:
  - distribution 偏渠道 (public/invite/embed), 与 batch (偏目标群体) 互补.
  - 一个 assessment 可有多个 distribution 实例.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.schemas import (
    DistributionCreateRequest,
    DistributionRow,
    DistributionStatusUpdateRequest,
)
from app.core.database import get_db
from app.db.models.distributions import Distribution
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import (
    reject_client as _reject_client,
)
from app.middleware.role_guards import (
    require_admin_or_counselor as _require_admin_or_counselor,
)

router = APIRouter()


def _orm_to_row(d: Distribution) -> DistributionRow:
    return DistributionRow(
        id=str(d.id),
        org_id=str(d.org_id),
        assessment_id=str(d.assessment_id),
        mode=d.mode or "public",
        batch_label=d.batch_label,
        targets=list(d.targets or []),
        schedule=dict(d.schedule or {}),
        status=d.status or "active",
        completed_count=int(d.completed_count or 0),
        created_by=str(d.created_by) if d.created_by else None,
        created_at=getattr(d, "created_at", None),
    )


@router.get("/", response_model=list[DistributionRow])
async def list_distributions(
    org_id: str,
    assessment_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DistributionRow]:
    """列表 (按 assessment_id). 镜像 service:6-12."""
    _reject_client(org)
    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")

    q = (
        select(Distribution)
        .where(Distribution.assessment_id == aid)
        .order_by(desc(Distribution.created_at))
    )
    rows = (await db.execute(q)).scalars().all()
    return [_orm_to_row(d) for d in rows]


@router.post("/", response_model=DistributionRow, status_code=status.HTTP_201_CREATED)
async def create_distribution(
    org_id: str,
    assessment_id: str,
    body: DistributionCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DistributionRow:
    """创建分发任务 (admin/counselor). 镜像 routes.ts:20-43 + service:25-45."""
    _require_admin_or_counselor(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    aid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        d = Distribution(
            org_id=org_uuid,
            assessment_id=aid,
            mode=body.mode or "public",
            batch_label=body.batch_label,
            targets=body.targets or [],
            schedule=body.schedule or {},
            status="active",
            completed_count=0,
            created_by=user_uuid,
        )
        db.add(d)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="distributions",
        resource_id=str(d.id),
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(d)


@router.patch("/{distribution_id}/status", response_model=DistributionRow)
async def update_distribution_status(
    org_id: str,
    assessment_id: str,
    distribution_id: str,
    body: DistributionStatusUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DistributionRow:
    """更新 status (admin/counselor). 镜像 routes.ts:46-57 + service:47-58."""
    _require_admin_or_counselor(org)

    did = parse_uuid_or_raise(distribution_id, field="distributionId")
    q = select(Distribution).where(Distribution.id == did).limit(1)
    d = (await db.execute(q)).scalar_one_or_none()
    if d is None:
        raise NotFoundError("Distribution", distribution_id)

    d.status = body.status
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="distributions",
        resource_id=distribution_id,
        ip_address=request.client.host if request.client else None,
    )
    return _orm_to_row(d)


__all__ = ["router"]
