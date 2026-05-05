"""
Scales / Material AI router — 镜像 ``ai-scales-material.routes.ts``.

5 个 endpoint:
  POST /extract-scale
  POST /create-scale-chat
  POST /analyze-material
  POST /analyze-material-formatted
  POST /note-guidance-chat
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines import (
    analyze_session_material,
    analyze_session_material_for_format,
    chat_create_scale,
    extract_scale,
    note_guidance_chat,
)
from app.api.v1.ai.schemas import (
    AnalyzeMaterialFormattedRequest,
    AnalyzeMaterialRequest,
    ChatRequest,
    ContentExtractRequest,
    MessagesOnlyRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor
from app.core.database import get_db
from app.lib.errors import ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/extract-scale")
async def extract_scale_endpoint(
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
    result = await extract_scale(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-scale",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/create-scale-chat")
async def create_scale_chat_endpoint(
    org_id: str,
    body: MessagesOnlyRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages:
        raise ValidationError("messages array is required and must not be empty")
    result = await chat_create_scale(
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
        resource="create-scale-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/analyze-material")
async def analyze_material_endpoint(
    org_id: str,
    body: AnalyzeMaterialRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    soap = await analyze_session_material(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="analyze-material",
        ip_address=request.client.host if request.client else None,
    )
    return soap


@router.post("/analyze-material-formatted")
async def analyze_material_formatted_endpoint(
    org_id: str,
    body: AnalyzeMaterialFormattedRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.content:
        raise ValidationError("content is required")
    if not body.format or not body.field_definitions:
        raise ValidationError("format and fieldDefinitions are required")

    fields = await analyze_session_material_for_format(
        db, org_id=org_id, user_id=user.id, input_=body.model_dump(by_alias=False)
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="analyze-material-formatted",
        ip_address=request.client.host if request.client else None,
    )
    return fields


@router.post("/note-guidance-chat")
async def note_guidance_chat_endpoint(
    org_id: str,
    body: ChatRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.messages or not body.context:
        raise ValidationError("messages and context are required")
    if not body.context.get("format"):
        raise ValidationError("context.format is required")
    field_defs = body.context.get("fieldDefinitions") or []
    if not isinstance(field_defs, list) or not field_defs:
        raise ValidationError("context.fieldDefinitions must be a non-empty array")

    response = await note_guidance_chat(
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
        resource="note-guidance-chat",
        ip_address=request.client.host if request.client else None,
    )
    return response


__all__ = ["router"]
