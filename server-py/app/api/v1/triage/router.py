"""
Triage router — 镜像 ``server/src/modules/triage/triage.routes.ts`` (121 行).

挂在 ``/api/orgs/{org_id}/triage`` prefix.

4 个 endpoint:

  GET   /candidates                    — master list (mode/batchId/level/counselorId filter)
  GET   /buckets                       — L1-L4 + unrated counts (sidebar badges)
  PATCH /results/{result_id}/risk-level — admin/counselor 手工调整 AI 等级
  POST  /results/{result_id}/candidate  — Phase H BUG-007: result→candidate lazy create

详情查询不在这里 — 复用现有 ``/results/{id}``, ``/episodes/{id}``, ``/crisis/cases/*`` 端点.

RBAC 守门:
  - 所有 GET 需 OrgContext (rejectClient 由 data_scope 自动过滤)
  - PATCH/POST 写入操作 require ``org_admin`` 或 ``counselor``
  - data_scope='assigned' 自动应用到 candidate / bucket 列表
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.triage.queries_service import (
    lazy_create_candidate,
    list_triage_buckets,
    list_triage_candidates,
    update_result_risk_level,
)
from app.api.v1.triage.schemas import (
    CandidatePoolRow,
    TriageBuckets,
    TriageCandidateRow,
    TriageLazyCandidateRequest,
    TriageMode,
    TriageRiskLevelPatchRequest,
    TriageRiskLevelPatchResponse,
)
from app.core.database import get_db
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.data_scope import DataScope, get_data_scope
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


def _parse_mode(value: str | None) -> TriageMode:
    """Node ``parseMode`` 等价: ``manual`` / ``all`` / 其他默认 ``screening``."""
    if value == "manual":
        return "manual"
    if value == "all":
        return "all"
    return "screening"


# ─── GET /candidates ─────────────────────────────────────────


@router.get("/candidates", response_model=list[TriageCandidateRow])
async def list_candidates(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    data_scope: Annotated[DataScope | None, Depends(get_data_scope)],
    db: Annotated[AsyncSession, Depends(get_db)],
    mode: Annotated[str | None, Query()] = None,
    batch_id: Annotated[str | None, Query(alias="batchId")] = None,
    assessment_id: Annotated[str | None, Query(alias="assessmentId")] = None,
    level: Annotated[str | None, Query()] = None,
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
) -> list[TriageCandidateRow]:
    """``GET /candidates`` — master list. 镜像 routes.ts:43-61."""
    _require_org(org)
    parse_uuid_or_raise(org_id, field="orgId")  # 校验 + 拒绝非法

    return await list_triage_candidates(
        db=db,
        org_id=org_id,
        mode=_parse_mode(mode),
        batch_id=batch_id,
        assessment_id=assessment_id,
        level=level,
        counselor_id=counselor_id,
        scope=data_scope,
    )


# ─── GET /buckets ────────────────────────────────────────────


@router.get("/buckets", response_model=TriageBuckets)
async def list_buckets(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    data_scope: Annotated[DataScope | None, Depends(get_data_scope)],
    db: Annotated[AsyncSession, Depends(get_db)],
    batch_id: Annotated[str | None, Query(alias="batchId")] = None,
    assessment_id: Annotated[str | None, Query(alias="assessmentId")] = None,
) -> TriageBuckets:
    """``GET /buckets`` — L1-L4 + unrated counts. 镜像 routes.ts:64-71."""
    _require_org(org)
    parse_uuid_or_raise(org_id, field="orgId")

    return await list_triage_buckets(
        db=db,
        org_id=org_id,
        batch_id=batch_id,
        assessment_id=assessment_id,
        scope=data_scope,
    )


# ─── PATCH /results/{result_id}/risk-level ───────────────────


@router.patch(
    "/results/{result_id}/risk-level",
    response_model=TriageRiskLevelPatchResponse,
)
async def patch_risk_level(
    org_id: str,
    result_id: str,
    body: TriageRiskLevelPatchRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TriageRiskLevelPatchResponse:
    """``PATCH /results/{result_id}/risk-level`` (admin/counselor). 镜像 routes.ts:74-89."""
    _require_admin_or_counselor(org)
    parse_uuid_or_raise(org_id, field="orgId")
    parse_uuid_or_raise(result_id, field="resultId")

    updated = await update_result_risk_level(
        db=db,
        org_id=org_id,
        result_id=result_id,
        risk_level=body.risk_level,
    )
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="triage.risk_level.updated",
        resource="assessment_results",
        resource_id=result_id,
    )
    return TriageRiskLevelPatchResponse(
        id=updated["id"],
        risk_level=updated.get("riskLevel"),
    )


# ─── POST /results/{result_id}/candidate (Phase H BUG-007) ────


@router.post(
    "/results/{result_id}/candidate",
    response_model=CandidatePoolRow,
    status_code=status.HTTP_201_CREATED,
)
async def lazy_candidate(
    org_id: str,
    result_id: str,
    body: TriageLazyCandidateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidatePoolRow:
    """``POST /results/{result_id}/candidate`` (admin/counselor). 镜像 routes.ts:103-120.

    Phase H — BUG-007 真正修复. 把 result 懒转成 candidate_pool 行, 让"转个案/课程·团辅/
    忽略"按钮在没规则引擎的机构也能 work.
    """
    _require_admin_or_counselor(org)
    parse_uuid_or_raise(org_id, field="orgId")
    parse_uuid_or_raise(result_id, field="resultId")

    candidate = await lazy_create_candidate(
        db=db,
        org_id=org_id,
        result_id=result_id,
        kind=body.kind,
        priority=body.priority,
    )
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="candidate.created.manual",
        resource="candidate_pool",
        resource_id=candidate.id,
    )
    return candidate


__all__ = ["router"]
