"""Client portal assessment results router (read-only).

镜像 ``server/src/modules/client-portal/client-assessment.routes.ts``:
  GET /results                          — 列我的结果 (client_visible=true only)
  GET /results/{result_id}              — 单个结果 (404 if not opted-in)
  GET /results/trajectory/{scale_id}    — 维度纵向追踪

Phase 9β 安全: 只回 ``client_visible=true`` (咨询师必须显式 opt-in 才让客户看).
Phase 14 监护人: ``?as=`` 拒绝 (家长完全不能看孩子测评).

self_only: 所有 query 强制 ``user_id == caller_uuid``.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.shared import reject_as_param
from app.core.database import get_db
from app.db.models.assessment_results import AssessmentResult
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _result_to_dict(r: AssessmentResult) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "orgId": str(r.org_id),
        "assessmentId": str(r.assessment_id),
        "userId": str(r.user_id) if r.user_id else None,
        "careEpisodeId": str(r.care_episode_id) if r.care_episode_id else None,
        "demographicData": r.demographic_data,
        "answers": r.answers,
        "customAnswers": r.custom_answers,
        "dimensionScores": r.dimension_scores,
        "totalScore": float(r.total_score) if r.total_score is not None else None,
        "riskLevel": r.risk_level,
        "aiInterpretation": r.ai_interpretation,
        "clientVisible": r.client_visible,
        "recommendations": list(r.recommendations or []),
        "aiProvenance": r.ai_provenance,
        "createdAt": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
    }


# ─── GET /results ──────────────────────────────────────────────


@router.get("/results")
async def list_results(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked + Phase 9β client_visible 过滤."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.user_id == user_uuid,
                AssessmentResult.client_visible.is_(True),
                AssessmentResult.deleted_at.is_(None),
            )
        )
        .order_by(desc(AssessmentResult.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_result_to_dict(r) for r in rows]


# ─── GET /results/{result_id} ──────────────────────────────────


@router.get("/results/{result_id}")
async def get_result(
    result_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """单个结果 — 强 self_only + client_visible 过滤. 不通过则 404."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    rid_uuid = parse_uuid_or_raise(result_id, field="resultId")

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.id == rid_uuid,
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.user_id == user_uuid,
                AssessmentResult.client_visible.is_(True),
                AssessmentResult.deleted_at.is_(None),
            )
        )
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Result", result_id)
    return _result_to_dict(row)


# ─── GET /results/trajectory/{scale_id} ────────────────────────


@router.get("/results/trajectory/{scale_id}")
async def get_trajectory(
    scale_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """维度纵向追踪 — 内联简化版.

    Node 端走 ``assessment.result.service.getTrajectory`` (含 dimension lookup,
    跨次匹配同 scale 的 dimension 等). 这里返回该用户该 scale 相关结果
    (client_visible 过滤), 由前端按 dimension 自行汇总. 服务端复杂派生留给
    将来 (Phase X 接 result_service port).
    """
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    scale_uuid = parse_uuid_or_raise(scale_id, field="scaleId")
    # scale_id 仅用于参数校验, 当前实现不走 scale_id 查 (与 Node port 简化一致).
    _ = scale_uuid

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.org_id == org_uuid,
                AssessmentResult.user_id == user_uuid,
                AssessmentResult.client_visible.is_(True),
                AssessmentResult.deleted_at.is_(None),
            )
        )
        .order_by(AssessmentResult.created_at)
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_result_to_dict(r) for r in rows]


__all__ = ["router"]
