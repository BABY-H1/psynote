"""
Crisis case router — 镜像 ``server/src/modules/crisis/crisis-case.routes.ts`` (166 行).

挂在 ``/api/orgs/{org_id}/crisis`` prefix:

  GET    /stats                          仪表板统计 (admin/counselor)
  GET    /cases                          列表 (filter ?stage=)
  GET    /cases/{caseId}                 详情
  GET    /cases/by-episode/{episodeId}   按 episode 查 (EpisodeDetail UI 入口)
  PUT    /cases/{caseId}/checklist/{stepKey}  更新单步 (admin/counselor)
  POST   /cases/{caseId}/submit          提交督导审核 (admin/counselor)
  POST   /cases/{caseId}/sign-off        督导审核 (admin/counselor — 督导是
                                         org_admin 或 counselor+full_practice_access)

Note: candidate accept (原子创建案件) 入口在 workflow 模块, 不在这里。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.crisis.dashboard_service import get_dashboard_stats
from app.api.v1.crisis.queries_service import (
    get_case_by_episode,
    get_case_by_id,
    list_cases,
)
from app.api.v1.crisis.schemas import (
    CrisisCaseOutput,
    DashboardOutput,
    SignOffInput,
    StepPayloadInput,
    SubmitInput,
)
from app.api.v1.crisis.workflow_service import (
    sign_off,
    submit_for_sign_off,
    update_checklist_step,
)
from app.core.database import get_db
from app.lib.errors import ForbiddenError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor

router = APIRouter()


# 5 个允许的 step keys (镜像 routes.ts:26-28)
STEP_KEYS = {"reinterview", "parentContact", "documents", "referral", "followUp"}


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


# ─── GET /stats ─────────────────────────────────────────────────


@router.get("/stats", response_model=DashboardOutput)
async def stats(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardOutput:
    """``GET /stats`` Phase 14b 机构级危机仪表板.

    镜像 routes.ts:62-72 — counselor 与 org_admin 都可以看 (聚合统计, 不是
    PHI), 不分 fullPracticeAccess。
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    return await get_dashboard_stats(db, org_uuid)


# ─── GET /cases ────────────────────────────────────────────────


@router.get("/cases", response_model=list[CrisisCaseOutput])
async def list_cases_route(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    stage: Annotated[str | None, Query()] = None,
) -> list[CrisisCaseOutput]:
    """``GET /cases`` 列表 (镜像 routes.ts:75-79).

    督导面板用 ``?stage=pending_sign_off`` 拉待审清单。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    return await list_cases(db, org_uuid, stage=stage)


# ─── GET /cases/{case_id} ──────────────────────────────────────


@router.get("/cases/{case_id}", response_model=CrisisCaseOutput)
async def get_case_route(
    org_id: str,
    case_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CrisisCaseOutput:
    """``GET /cases/{case_id}`` 详情 (镜像 routes.ts:82-86)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    case_uuid = parse_uuid_or_raise(case_id, field="caseId")
    return await get_case_by_id(db, org_uuid, case_uuid)


# ─── GET /cases/by-episode/{episode_id} ────────────────────────


@router.get("/cases/by-episode/{episode_id}", response_model=CrisisCaseOutput | None)
async def get_case_by_episode_route(
    org_id: str,
    episode_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CrisisCaseOutput | None:
    """``GET /cases/by-episode/{episode_id}`` (镜像 routes.ts:89-94).

    EpisodeDetail UI 主入口 — 返 None 而非 404 (UI 不渲染危机模块就好)。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    ep_uuid = parse_uuid_or_raise(episode_id, field="episodeId")
    return await get_case_by_episode(db, org_uuid, ep_uuid)


# ─── PUT /cases/{case_id}/checklist/{step_key} ────────────────


@router.put("/cases/{case_id}/checklist/{step_key}", response_model=CrisisCaseOutput)
async def update_step_route(
    org_id: str,
    case_id: str,
    step_key: str,
    body: StepPayloadInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CrisisCaseOutput:
    """``PUT /cases/{case_id}/checklist/{step_key}`` 更新单步 (镜像 routes.ts:97-119).

    rbac: org_admin / counselor (来访者无危机面板权限)。
    """
    _require_admin_or_counselor(org)
    if step_key not in STEP_KEYS:
        raise ValidationError(f"未知步骤 {step_key}")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    case_uuid = parse_uuid_or_raise(case_id, field="caseId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 透传完整 dict (passthrough zod 等价): 用 by_alias=True 拿 camelCase keys
    payload = body.model_dump(by_alias=True, exclude_none=True)

    updated = await update_checklist_step(
        db,
        org_id=org_uuid,
        case_id=case_uuid,
        step_key=step_key,
        payload=payload,
        user_id=user_uuid,
    )

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="crisis.step.updated",
        resource="crisis_cases",
        resource_id=case_id,
        ip_address=request.client.host if request.client else None,
    )
    return updated


# ─── POST /cases/{case_id}/submit ──────────────────────────────


@router.post("/cases/{case_id}/submit", response_model=CrisisCaseOutput)
async def submit_route(
    org_id: str,
    case_id: str,
    body: SubmitInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CrisisCaseOutput:
    """``POST /cases/{case_id}/submit`` 提交督导审核 (镜像 routes.ts:122-139)."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    case_uuid = parse_uuid_or_raise(case_id, field="caseId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    updated = await submit_for_sign_off(
        db,
        org_id=org_uuid,
        case_id=case_uuid,
        closure_summary=body.closure_summary,
        user_id=user_uuid,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="crisis.submitted_for_sign_off",
        resource="crisis_cases",
        resource_id=case_id,
        ip_address=request.client.host if request.client else None,
    )
    return updated


# ─── POST /cases/{case_id}/sign-off ────────────────────────────


@router.post("/cases/{case_id}/sign-off", response_model=CrisisCaseOutput)
async def sign_off_route(
    org_id: str,
    case_id: str,
    body: SignOffInput,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CrisisCaseOutput:
    """``POST /cases/{case_id}/sign-off`` 督导审核 (镜像 routes.ts:142-165).

    Note: counselor with full_practice_access acts as supervisor (no
    dedicated supervisor role)。
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    case_uuid = parse_uuid_or_raise(case_id, field="caseId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    updated = await sign_off(
        db,
        org_id=org_uuid,
        case_id=case_uuid,
        approve=body.approve,
        supervisor_note=body.supervisor_note,
        user_id=user_uuid,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="crisis.signed_off" if body.approve else "crisis.reopened",
        resource="crisis_cases",
        resource_id=case_id,
        ip_address=request.client.host if request.client else None,
    )
    return updated


__all__ = ["router"]
