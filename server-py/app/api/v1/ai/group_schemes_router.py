"""
Group schemes AI router — 镜像 ``ai-group-schemes.routes.ts``.

7 个 endpoint:
  POST /generate-scheme
  POST /generate-scheme-overall
  POST /generate-session-detail
  POST /refine-scheme-overall
  POST /refine-session-detail
  POST /extract-scheme
  POST /create-scheme-chat
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines import (
    chat_create_scheme,
    extract_scheme,
    generate_group_scheme,
    generate_group_scheme_overall,
    generate_group_session_detail,
    refine_group_scheme_overall,
    refine_group_session_detail,
)
from app.api.v1.ai.schemas import (
    ContentExtractRequest,
    GenerateSchemeOverallRequest,
    GenerateSchemeRequest,
    GenerateSessionDetailRequest,
    MessagesOnlyRequest,
    RefineSchemeOverallRequest,
    RefineSessionDetailRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor
from app.core.database import get_db
from app.lib.errors import ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/generate-scheme")
async def generate_scheme_endpoint(
    org_id: str,
    body: GenerateSchemeRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.prompt:
        raise ValidationError("prompt is required")
    scheme = await generate_group_scheme(db, org_id=org_id, user_id=user.id, prompt=body.prompt)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-scheme",
        ip_address=request.client.host if request.client else None,
    )
    return scheme


@router.post("/generate-scheme-overall")
async def generate_scheme_overall_endpoint(
    org_id: str,
    body: GenerateSchemeOverallRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.prompt:
        raise ValidationError("prompt is required")
    overview = await generate_group_scheme_overall(
        db, org_id=org_id, user_id=user.id, prompt=body.prompt
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-scheme-overall",
        ip_address=request.client.host if request.client else None,
    )
    return overview


@router.post("/generate-session-detail")
async def generate_session_detail_endpoint(
    org_id: str,
    body: GenerateSessionDetailRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    detail = await generate_group_session_detail(
        db,
        org_id=org_id,
        user_id=user.id,
        overall_scheme=body.overall_scheme,
        session_index=body.session_index,
        prompt=body.prompt,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-session-detail",
        ip_address=request.client.host if request.client else None,
    )
    return detail


@router.post("/refine-scheme-overall")
async def refine_scheme_overall_endpoint(
    org_id: str,
    body: RefineSchemeOverallRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.instruction:
        raise ValidationError("instruction is required")
    refined = await refine_group_scheme_overall(
        db,
        org_id=org_id,
        user_id=user.id,
        current_scheme=body.current_scheme,
        instruction=body.instruction,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="refine-scheme-overall",
        ip_address=request.client.host if request.client else None,
    )
    return refined


@router.post("/refine-session-detail")
async def refine_session_detail_endpoint(
    org_id: str,
    body: RefineSessionDetailRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.instruction:
        raise ValidationError("instruction is required")
    refined = await refine_group_session_detail(
        db,
        org_id=org_id,
        user_id=user.id,
        current_session=body.current_session,
        overall_scheme=body.overall_scheme,
        session_index=body.session_index,
        instruction=body.instruction,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="refine-session-detail",
        ip_address=request.client.host if request.client else None,
    )
    return refined


@router.post("/extract-scheme")
async def extract_scheme_endpoint(
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
    result = await extract_scheme(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-scheme",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/create-scheme-chat")
async def create_scheme_chat_endpoint(
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
    result = await chat_create_scheme(
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
        resource="create-scheme-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


__all__ = ["router"]
