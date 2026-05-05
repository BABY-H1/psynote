"""
Goal library router — 镜像 ``server/src/modules/counseling/goal-library.routes.ts`` (60 行)。

挂在 ``/api/orgs/{org_id}/goal-library`` prefix。

5 个 endpoint:

  GET    /                  — 列表 (filters: problemArea / category / visibility)
  GET    /{goal_id}         — 详情
  POST   /                  — 创建 (admin/counselor)
  PATCH  /{goal_id}         — 更新 (admin/counselor; ownership 检查)
  DELETE /{goal_id}         — 删除 (admin/counselor; ownership 检查)

RBAC:
  - 全 router rejectClient
  - POST/PATCH/DELETE require ``org_admin`` or ``counselor``
  - PATCH/DELETE 走 assertLibraryItemOwnedByOrg

知识库分发: visibility ∈ {personal, organization, public} — 与 note_templates 风格一致。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import and_, delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    GoalLibraryCreateRequest,
    GoalLibraryOutput,
    GoalLibraryUpdateRequest,
    OkResponse,
)
from app.core.database import get_db
from app.db.models.treatment_goal_library import TreatmentGoalLibrary
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _reject_client(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("来访者请通过客户端门户访问")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _goal_to_output(g: TreatmentGoalLibrary) -> GoalLibraryOutput:
    return GoalLibraryOutput(
        id=str(g.id),
        org_id=str(g.org_id) if g.org_id else None,
        title=g.title,
        description=g.description,
        problem_area=g.problem_area,
        category=g.category,
        objectives_template=list(g.objectives_template) if g.objectives_template else [],
        intervention_suggestions=list(g.intervention_suggestions)
        if g.intervention_suggestions
        else [],
        visibility=g.visibility or "personal",
        created_by=str(g.created_by) if g.created_by else None,
        created_at=getattr(g, "created_at", None),
        updated_at=getattr(g, "updated_at", None),
    )


async def _assert_goal_owned_by_org(db: AsyncSession, goal_id: uuid.UUID, org_id: str) -> None:
    """``assertLibraryItemOwnedByOrg`` 等价 — 只允许操作本机构的 goal (或平台级)。"""
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(TreatmentGoalLibrary.org_id).where(TreatmentGoalLibrary.id == goal_id).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("TreatmentGoalLibrary", str(goal_id))
    goal_org_id = row[0]
    if goal_org_id is not None and goal_org_id != org_uuid:
        raise ForbiddenError("目标不属于当前机构")


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[GoalLibraryOutput])
async def list_goals(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    problem_area: Annotated[str | None, Query(alias="problemArea")] = None,
    category: Annotated[str | None, Query()] = None,
    visibility: Annotated[str | None, Query()] = None,
) -> list[GoalLibraryOutput]:
    """``GET /`` 列表 (镜像 routes.ts:17-20 + service.ts:6-26).

    visibility 过滤: personal (自己创建) / organization (本 org) / public (平台级)。
    """
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    base_visibility = or_(
        and_(
            TreatmentGoalLibrary.visibility == "personal",
            TreatmentGoalLibrary.created_by == user_uuid,
        ),
        and_(
            TreatmentGoalLibrary.visibility == "organization",
            TreatmentGoalLibrary.org_id == org_uuid,
        ),
        TreatmentGoalLibrary.visibility == "public",
    )

    conds: list[Any] = [base_visibility]
    if problem_area:
        conds.append(TreatmentGoalLibrary.problem_area == problem_area)
    if category:
        conds.append(TreatmentGoalLibrary.category == category)

    q = (
        select(TreatmentGoalLibrary)
        .where(and_(*conds))
        .order_by(desc(TreatmentGoalLibrary.updated_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    out = [_goal_to_output(g) for g in rows]
    # visibility query 是显式过滤 (Node 端用 filters?.visibility 但 service 没真消费 — 保持一致行为不再二次过滤)
    _ = visibility
    return out


# ─── GET /{goal_id} ────────────────────────────────────────────


@router.get("/{goal_id}", response_model=GoalLibraryOutput)
async def get_goal(
    org_id: str,
    goal_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GoalLibraryOutput:
    """``GET /{goal_id}`` 详情 (镜像 service.ts:28-32)."""
    _reject_client(org)
    goal_uuid = parse_uuid_or_raise(goal_id, field="goalId")
    q = select(TreatmentGoalLibrary).where(TreatmentGoalLibrary.id == goal_uuid).limit(1)
    goal = (await db.execute(q)).scalar_one_or_none()
    if goal is None:
        raise NotFoundError("TreatmentGoalLibrary", goal_id)
    return _goal_to_output(goal)


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=GoalLibraryOutput, status_code=status.HTTP_201_CREATED)
async def create_goal(
    org_id: str,
    body: GoalLibraryCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GoalLibraryOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:27-41 + service.ts:34-57."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    goal = TreatmentGoalLibrary(
        org_id=org_uuid,
        title=body.title,
        description=body.description,
        problem_area=body.problem_area,
        category=body.category,
        objectives_template=body.objectives_template or [],
        intervention_suggestions=body.intervention_suggestions or [],
        visibility=body.visibility or "personal",
        created_by=user_uuid,
    )
    db.add(goal)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="treatment_goal_library",
        resource_id=str(goal.id),
    )
    return _goal_to_output(goal)


# ─── PATCH /{goal_id} ──────────────────────────────────────────


@router.patch("/{goal_id}", response_model=GoalLibraryOutput)
async def update_goal(
    org_id: str,
    goal_id: str,
    body: GoalLibraryUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GoalLibraryOutput:
    """``PATCH /{goal_id}`` (admin/counselor). 镜像 routes.ts:43-50 + service.ts:59-69."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    goal_uuid = parse_uuid_or_raise(goal_id, field="goalId")
    await _assert_goal_owned_by_org(db, goal_uuid, org_id)

    q = select(TreatmentGoalLibrary).where(TreatmentGoalLibrary.id == goal_uuid).limit(1)
    goal = (await db.execute(q)).scalar_one_or_none()
    if goal is None:
        raise NotFoundError("TreatmentGoalLibrary", goal_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field_name, value in updates.items():
        setattr(goal, field_name, value)
    goal.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="treatment_goal_library",
        resource_id=goal_id,
    )
    return _goal_to_output(goal)


# ─── DELETE /{goal_id} ─────────────────────────────────────────


@router.delete("/{goal_id}", response_model=OkResponse)
async def delete_goal(
    org_id: str,
    goal_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """``DELETE /{goal_id}`` (admin/counselor). 镜像 routes.ts:52-58 + service.ts:71-75."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    goal_uuid = parse_uuid_or_raise(goal_id, field="goalId")
    await _assert_goal_owned_by_org(db, goal_uuid, org_id)

    q = select(TreatmentGoalLibrary).where(TreatmentGoalLibrary.id == goal_uuid).limit(1)
    goal = (await db.execute(q)).scalar_one_or_none()
    if goal is None:
        raise NotFoundError("TreatmentGoalLibrary", goal_id)

    await db.execute(delete(TreatmentGoalLibrary).where(TreatmentGoalLibrary.id == goal_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="treatment_goal_library",
        resource_id=goal_id,
    )
    return OkResponse()


__all__ = ["router"]
