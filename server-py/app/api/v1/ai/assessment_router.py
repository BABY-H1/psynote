"""
Assessment AI router — 镜像 ``server/src/modules/ai/ai-assessment.routes.ts``。

挂在 ``/api/orgs/{org_id}/ai`` (composite, 由主 ``router.py`` include)。

6 个 endpoint:
  POST /interpret-result
  POST /risk-assess
  POST /triage
  POST /analyze-session
  POST /progress-report
  POST /referral-summary
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines import (
    analyze_soap,
    assess_risk,
    generate_progress_report,
    generate_referral_summary,
    interpret_result,
    recommend_triage,
)
from app.api.v1.ai.schemas import (
    AnalyzeSessionRequest,
    InterpretResultRequest,
    ProgressReportRequest,
    ReferralSummaryRequest,
    RiskAssessRequest,
    TriageRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor
from app.core.database import get_db
from app.lib.errors import ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/interpret-result")
async def interpret_result_endpoint(
    org_id: str,
    body: InterpretResultRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.scale_name:
        raise ValidationError("scaleName is required")

    interpretation = await interpret_result(
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
        resource="interpret-result",
        ip_address=request.client.host if request.client else None,
    )
    return {"interpretation": interpretation}


@router.post("/risk-assess")
async def risk_assess_endpoint(
    org_id: str,
    body: RiskAssessRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    result = await assess_risk(
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
        resource="risk-assess",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/triage")
async def triage_endpoint(
    org_id: str,
    body: TriageRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.risk_level:
        raise ValidationError("riskLevel is required")

    payload = body.model_dump(by_alias=False)
    if not payload.get("available_interventions"):
        payload["available_interventions"] = ["course", "group", "counseling", "referral"]

    recommendation = await recommend_triage(db, org_id=org_id, user_id=user.id, input_=payload)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="triage",
        ip_address=request.client.host if request.client else None,
    )
    return recommendation


@router.post("/analyze-session")
async def analyze_session_endpoint(
    org_id: str,
    body: AnalyzeSessionRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    analysis = await analyze_soap(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="analyze-session",
        ip_address=request.client.host if request.client else None,
    )
    return analysis


@router.post("/progress-report")
async def progress_report_endpoint(
    org_id: str,
    body: ProgressReportRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.comparisons or len(body.comparisons) < 2:
        raise ValidationError("At least 2 comparison data points are required")

    report = await generate_progress_report(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="progress-report",
        ip_address=request.client.host if request.client else None,
    )
    return {"report": report}


@router.post("/referral-summary")
async def referral_summary_endpoint(
    org_id: str,
    body: ReferralSummaryRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.reason:
        raise ValidationError("reason is required")

    summary = await generate_referral_summary(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="referral-summary",
        ip_address=request.client.host if request.client else None,
    )
    return {"summary": summary}


__all__ = ["router"]
