"""
Treatment plan router — 镜像 ``server/src/modules/counseling/treatment-plan.routes.ts`` (86 行)。

挂在 ``/api/orgs/{org_id}/treatment-plans`` prefix。

5 个 endpoint:

  GET    /                                — 列表 (按 careEpisodeId, required)
  GET    /{plan_id}                       — 详情
  POST   /                                — 创建 (admin/counselor) + 写 timeline
  PATCH  /{plan_id}                       — 部分更新
  PATCH  /{plan_id}/goals/{goal_id}       — 仅更新某 goal status (in-place JSONB)

RBAC 守门:
  - 所有 GET 需 OrgContext
  - POST/PATCH 需 admin/counselor

业务结构:
  - goals JSONB: ``[{id, description, status, ...}]`` 从 treatment_goal_library 拉
  - interventions JSONB: ``[{...}]``
  - status: draft / active / completed / archived
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    GoalStatusRequest,
    TreatmentPlanCreateRequest,
    TreatmentPlanOutput,
    TreatmentPlanUpdateRequest,
)
from app.core.database import get_db
from app.db.models.care_timeline import CareTimeline
from app.db.models.treatment_plans import TreatmentPlan
from app.lib.errors import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor as _require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _plan_to_output(p: TreatmentPlan) -> TreatmentPlanOutput:
    return TreatmentPlanOutput(
        id=str(p.id),
        org_id=str(p.org_id),
        care_episode_id=str(p.care_episode_id),
        counselor_id=str(p.counselor_id),
        status=p.status or "draft",
        title=p.title,
        approach=p.approach,
        goals=list(p.goals) if p.goals else [],
        interventions=list(p.interventions) if p.interventions else [],
        session_plan=p.session_plan,
        progress_notes=p.progress_notes,
        review_date=p.review_date,
        created_at=getattr(p, "created_at", None),
        updated_at=getattr(p, "updated_at", None),
    )


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[TreatmentPlanOutput])
async def list_plans(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[TreatmentPlanOutput]:
    """``GET /?careEpisodeId=`` 列表 (镜像 routes.ts:16-20 + service.ts:6-17)."""
    _require_org(org)
    if not care_episode_id:
        raise ValidationError("careEpisodeId is required")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    care_uuid = parse_uuid_or_raise(care_episode_id, field="careEpisodeId")

    q = (
        select(TreatmentPlan)
        .where(
            and_(
                TreatmentPlan.org_id == org_uuid,
                TreatmentPlan.care_episode_id == care_uuid,
            )
        )
        .order_by(desc(TreatmentPlan.updated_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_plan_to_output(p) for p in rows]


# ─── GET /{plan_id} 详情 ────────────────────────────────────────


@router.get("/{plan_id}", response_model=TreatmentPlanOutput)
async def get_plan(
    org_id: str,
    plan_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TreatmentPlanOutput:
    """``GET /{plan_id}`` 详情 (镜像 routes.ts:23-26 + service.ts:19-28)."""
    _require_org(org)
    plan_uuid = parse_uuid_or_raise(plan_id, field="planId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权读
    q = (
        select(TreatmentPlan)
        .where(
            TreatmentPlan.id == plan_uuid,
            TreatmentPlan.org_id == org_uuid,
        )
        .limit(1)
    )
    plan = (await db.execute(q)).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("TreatmentPlan", plan_id)
    return _plan_to_output(plan)


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=TreatmentPlanOutput, status_code=status.HTTP_201_CREATED)
async def create_plan(
    org_id: str,
    body: TreatmentPlanCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TreatmentPlanOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:29-56 + service.ts:30-75.

    Transactional: plan + timeline event 单 commit.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    care_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")

    try:
        plan = TreatmentPlan(
            org_id=org_uuid,
            care_episode_id=care_uuid,
            counselor_id=user_uuid,
            title=body.title,
            approach=body.approach,
            goals=body.goals or [],
            interventions=body.interventions or [],
            session_plan=body.session_plan,
            progress_notes=body.progress_notes,
            review_date=body.review_date,
            status=body.status or "draft",
        )
        db.add(plan)
        await db.flush()  # 拿 plan.id

        db.add(
            CareTimeline(
                care_episode_id=care_uuid,
                event_type="treatment_plan",
                ref_id=plan.id,
                title="制定治疗计划",
                summary=body.title or "新治疗计划",
                metadata_={
                    "approach": body.approach,
                    "goalCount": len(body.goals or []),
                },
                created_by=user_uuid,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="treatment_plans",
        resource_id=str(plan.id),
        ip_address=request.client.host if request.client else None,
    )
    return _plan_to_output(plan)


# ─── PATCH /{plan_id} ──────────────────────────────────────────


@router.patch("/{plan_id}", response_model=TreatmentPlanOutput)
async def update_plan(
    org_id: str,
    plan_id: str,
    body: TreatmentPlanUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TreatmentPlanOutput:
    """``PATCH /{plan_id}`` (admin/counselor). 镜像 service.ts:77-98."""
    _require_admin_or_counselor(org)
    plan_uuid = parse_uuid_or_raise(plan_id, field="planId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权写
    q = (
        select(TreatmentPlan)
        .where(
            TreatmentPlan.id == plan_uuid,
            TreatmentPlan.org_id == org_uuid,
        )
        .limit(1)
    )
    plan = (await db.execute(q)).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("TreatmentPlan", plan_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field_name, value in updates.items():
        setattr(plan, field_name, value)
    plan.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="treatment_plans",
        resource_id=plan_id,
        ip_address=request.client.host if request.client else None,
    )
    return _plan_to_output(plan)


# ─── PATCH /{plan_id}/goals/{goal_id} 单 goal status 更新 ─────


@router.patch("/{plan_id}/goals/{goal_id}", response_model=TreatmentPlanOutput)
async def update_goal_status(
    org_id: str,
    plan_id: str,
    goal_id: str,
    body: GoalStatusRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TreatmentPlanOutput:
    """``PATCH /{plan_id}/goals/{goal_id}`` (admin/counselor). 镜像 service.ts:100-119.

    In-place 修改 goals JSONB 中匹配 id 的 goal 的 status, 找不到 → 404。
    """
    _require_admin_or_counselor(org)
    plan_uuid = parse_uuid_or_raise(plan_id, field="planId")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    # Phase 5 P0 fix (Fix 2): 详情按 (id, org_id) 双 filter, 防止跨组织 PHI 越权写
    q = (
        select(TreatmentPlan)
        .where(
            TreatmentPlan.id == plan_uuid,
            TreatmentPlan.org_id == org_uuid,
        )
        .limit(1)
    )
    plan = (await db.execute(q)).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("TreatmentPlan", plan_id)

    goals: list[dict[str, Any]] = [dict(g) for g in (plan.goals or [])]
    goal_index: int = -1
    for i, g in enumerate(goals):
        if g.get("id") == goal_id:
            goal_index = i
            break
    if goal_index < 0:
        raise NotFoundError("TreatmentGoal", goal_id)

    goals[goal_index]["status"] = body.status
    plan.goals = cast("list[Any]", goals)
    plan.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="treatment_plans",
        resource_id=plan_id,
        ip_address=request.client.host if request.client else None,
    )
    return _plan_to_output(plan)


__all__ = ["router"]
