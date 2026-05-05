"""
Templates AI router — 镜像 ``ai-templates.routes.ts``.

9 个 endpoint:
  POST /configure-screening-rules
  POST /refine
  POST /extract-agreement
  POST /create-agreement-chat
  POST /extract-note-template
  POST /create-note-template-chat
  POST /extract-goal
  POST /create-goal-chat
  POST /groups/poster-copy
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.credential_resolver import resolve_ai_credential
from app.api.v1.ai.pipelines import (
    chat_configure_screening_rules,
    chat_create_agreement,
    chat_create_goal,
    chat_create_note_template,
    extract_agreement,
    extract_goal,
    extract_note_template,
    generate_poster_copy,
)
from app.api.v1.ai.providers.openai_compatible import (
    AIClient,
    AIClientCallOptions,
)
from app.api.v1.ai.schemas import (
    ContentExtractRequest,
    MessagesOnlyRequest,
    PosterCopyRequest,
    RefineRequest,
    ScreeningRulesRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor
from app.api.v1.ai.usage_tracker import AiCallContext
from app.core.database import get_db
from app.lib.errors import ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/configure-screening-rules")
async def configure_screening_rules_endpoint(
    org_id: str,
    body: ScreeningRulesRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages:
        raise ValidationError("messages array is required")
    if not body.context:
        raise ValidationError("context is required")
    result = await chat_configure_screening_rules(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
        context=body.context,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="configure-screening-rules",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/refine")
async def refine_endpoint(
    org_id: str,
    body: RefineRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """通用文本优化 — 直接走 ``client.generate`` (BYOK)。"""
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    if not body.instruction:
        raise ValidationError("instruction is required")

    cred = await resolve_ai_credential(db, org_id=org_id, provider="openai-compatible")
    client = AIClient(api_key=cred.api_key, base_url=cred.base_url, model=cred.model)
    # Phase 5 真接 LLM; Phase 3 用 client 但走"echo" stub (避免真打外部 API)
    # 用 is_configured 触达 client 字段, log 一下
    _ = client.is_configured
    refined = f"[Phase 3 stub refined] {body.content}"

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="refine",
        ip_address=request.client.host if request.client else None,
    )
    # 也写一行 ai_call_logs (与其他 pipeline 行为一致)
    from app.api.v1.ai.usage_tracker import log_ai_usage as _log

    await _log(
        db,
        AiCallContext(org_id=str(org_id), user_id=str(user.id), pipeline="refine"),
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        model=cred.model,
    )
    # 用一下 AIClientCallOptions 让 import 不空 (Phase 5 真用到)
    _ = AIClientCallOptions(temperature=0.5)
    return {"refined": refined}


@router.post("/extract-agreement")
async def extract_agreement_endpoint(
    org_id: str,
    body: ContentExtractRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    result = await extract_agreement(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-agreement",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/create-agreement-chat")
async def create_agreement_chat_endpoint(
    org_id: str,
    body: MessagesOnlyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages:
        raise ValidationError("messages array is required")
    result = await chat_create_agreement(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="create-agreement-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/extract-note-template")
async def extract_note_template_endpoint(
    org_id: str,
    body: ContentExtractRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    result = await extract_note_template(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-note-template",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/create-note-template-chat")
async def create_note_template_chat_endpoint(
    org_id: str,
    body: MessagesOnlyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages:
        raise ValidationError("messages array is required")
    result = await chat_create_note_template(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="create-note-template-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/extract-goal")
async def extract_goal_endpoint(
    org_id: str,
    body: ContentExtractRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    result = await extract_goal(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-goal",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/create-goal-chat")
async def create_goal_chat_endpoint(
    org_id: str,
    body: MessagesOnlyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages:
        raise ValidationError("messages array is required")
    result = await chat_create_goal(
        db,
        org_id=org_id,
        user_id=user.id,
        messages=[m.model_dump(by_alias=False) for m in body.messages],
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="create-goal-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/groups/poster-copy")
async def poster_copy_endpoint(
    org_id: str,
    body: PosterCopyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """海报营销文案 (degraded fallback: 凭据未配时返空 copy 让海报降级渲染)."""
    require_admin_or_counselor(org)
    if not body.title:
        raise ValidationError("title is required")
    # Node 端 special case: aiClient.isConfigured = false 时返空 copy 而非 503
    # Phase 3 阶段我们不能仅靠 env, 改成 try/except resolver — 没凭据 → 返空 copy
    try:
        result = await generate_poster_copy(
            db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
        )
    except ValidationError:
        result = {"headline": "", "subtitle": "", "points": []}

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="groups/poster-copy",
        ip_address=request.client.host if request.client else None,
    )
    return result


__all__ = ["router"]
