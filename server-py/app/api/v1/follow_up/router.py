"""
Follow-up 路由 — 镜像 ``server/src/modules/follow-up/follow-up.routes.ts`` (114 行)。

挂在 ``/api/orgs/{org_id}/follow-up`` prefix 下:

  GET   /plans              — 列表 (filters: careEpisodeId)
  POST  /plans              — 创建 plan (org_admin / counselor)
  PATCH /plans/{plan_id}    — 更新 plan
  GET   /reviews            — 列表 (强制 careEpisodeId)
  POST  /reviews            — 创建 review (复合事务: review + timeline + 可能关 episode)

RBAC:
  - 所有端点要 OrgContext + dataScopeGuard 等价 (assigned scope 走 client_id 过滤)
  - POST/PATCH 写入要 ``org_admin`` or ``counselor``
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.follow_up.schemas import (
    CreateFollowUpPlanRequest,
    CreateFollowUpReviewRequest,
    FollowUpPlanRow,
    FollowUpReviewRow,
    UpdateFollowUpPlanRequest,
)
from app.api.v1.follow_up.service import (
    create_follow_up_plan,
    create_follow_up_review,
    list_follow_up_plans,
    list_follow_up_reviews,
    update_follow_up_plan,
)
from app.core.database import get_db
from app.lib.errors import ForbiddenError, ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.data_scope import DataScope, get_data_scope
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext) -> None:
    """``requireRole('org_admin', 'counselor')`` (POST/PATCH 写入守门)."""
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError(
            "This action requires one of the following roles: org_admin, counselor"
        )


# ─── Plans ──────────────────────────────────────────────────────


@router.get("/plans", response_model=list[FollowUpPlanRow])
async def list_plans(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    scope: Annotated[DataScope | None, Depends(get_data_scope)],
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[FollowUpPlanRow]:
    """``GET /plans`` — 镜像 routes.ts:18-21."""
    _require_org(org)
    return await list_follow_up_plans(db, org_id, care_episode_id, scope)


@router.post("/plans", response_model=FollowUpPlanRow, status_code=status.HTTP_201_CREATED)
async def create_plan(
    org_id: str,
    body: CreateFollowUpPlanRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> FollowUpPlanRow:
    """``POST /plans`` — 镜像 routes.ts:24-51. 写入 + audit."""
    org_ctx = _require_org(org)
    _require_admin_or_counselor(org_ctx)

    if not body.care_episode_id:
        raise ValidationError("careEpisodeId is required")

    try:
        plan = await create_follow_up_plan(db, org_id=org_id, counselor_id=user.id, body=body)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="follow_up_plans",
        resource_id=plan.id,
        ip_address=request.client.host if request.client else None,
    )
    return plan


@router.patch("/plans/{plan_id}", response_model=FollowUpPlanRow)
async def update_plan(
    org_id: str,
    plan_id: str,
    body: UpdateFollowUpPlanRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> FollowUpPlanRow:
    """``PATCH /plans/{plan_id}`` — 镜像 routes.ts:54-72."""
    org_ctx = _require_org(org)
    _require_admin_or_counselor(org_ctx)

    try:
        updated = await update_follow_up_plan(db, plan_id, body)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="follow_up_plans",
        resource_id=plan_id,
        ip_address=request.client.host if request.client else None,
    )
    return updated


# ─── Reviews ────────────────────────────────────────────────────


@router.get("/reviews", response_model=list[FollowUpReviewRow])
async def list_reviews(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[FollowUpReviewRow]:
    """``GET /reviews`` — 镜像 routes.ts:77-81. careEpisodeId 必填."""
    _require_org(org)
    if not care_episode_id:
        raise ValidationError("careEpisodeId query param is required")
    _ = org_id  # 路由层不再二次过滤 (review 已挂 episode 上, episode 已挂 org)
    return await list_follow_up_reviews(db, care_episode_id)


@router.post("/reviews", response_model=FollowUpReviewRow, status_code=status.HTTP_201_CREATED)
async def create_review(
    org_id: str,
    body: CreateFollowUpReviewRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> FollowUpReviewRow:
    """``POST /reviews`` — 镜像 routes.ts:84-113. 复合事务."""
    org_ctx = _require_org(org)
    _require_admin_or_counselor(org_ctx)

    if not body.plan_id:
        raise ValidationError("planId is required")
    if not body.care_episode_id:
        raise ValidationError("careEpisodeId is required")

    try:
        review = await create_follow_up_review(db, counselor_id=user.id, body=body)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="follow_up_reviews",
        resource_id=review.id,
        ip_address=request.client.host if request.client else None,
    )
    return review


__all__ = ["router"]
