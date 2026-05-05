"""
Treatment AI router — 镜像 ``server/src/modules/ai/ai-treatment.routes.ts``.

6 个 endpoint:
  POST /suggest-treatment-plan
  POST /client-summary
  POST /case-progress-report
  POST /simulated-client
  POST /supervision
  POST /recommendations  (no role guard — client portal 也用)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines import (
    case_progress_report,
    client_summary,
    generate_recommendations,
    simulated_client_chat,
    suggest_treatment_plan,
    supervision_chat,
)
from app.api.v1.ai.schemas import (
    CaseProgressRequest,
    ChatRequest,
    ClientSummaryRequest,
    RecommendationsRequest,
    TreatmentPlanRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor, require_org
from app.core.database import get_db
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/suggest-treatment-plan")
async def suggest_treatment_plan_endpoint(
    org_id: str,
    body: TreatmentPlanRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    suggestion = await suggest_treatment_plan(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="suggest-treatment-plan",
        ip_address=request.client.host if request.client else None,
    )
    return suggestion


@router.post("/client-summary")
async def client_summary_endpoint(
    org_id: str,
    body: ClientSummaryRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    summary = await client_summary(
        db,
        org_id=org_id,
        user_id=user.id,
        client_id=body.client_id,
        episode_id=body.episode_id,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="client-summary",
        ip_address=request.client.host if request.client else None,
    )
    return summary


@router.post("/case-progress-report")
async def case_progress_report_endpoint(
    org_id: str,
    body: CaseProgressRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    report = await case_progress_report(
        db, org_id=org_id, user_id=user.id, episode_id=body.episode_id
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="case-progress-report",
        ip_address=request.client.host if request.client else None,
    )
    return report


@router.post("/simulated-client")
async def simulated_client_endpoint(
    org_id: str,
    body: ChatRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    result = await simulated_client_chat(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
        context=body.context or {},
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="simulated-client",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/supervision")
async def supervision_endpoint(
    org_id: str,
    body: ChatRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    result = await supervision_chat(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
        context=body.context or {},
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="supervision",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/recommendations")
async def recommendations_endpoint(
    org_id: str,
    body: RecommendationsRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """无 ``requireRole`` — client portal 用此, client 角色也能调。"""
    require_org(org)
    result = await generate_recommendations(
        db,
        org_id=org_id,
        user_id=user.id,
        input_=body.model_dump(by_alias=False),
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="recommendations",
        ip_address=request.client.host if request.client else None,
    )
    return result


__all__ = ["router"]
