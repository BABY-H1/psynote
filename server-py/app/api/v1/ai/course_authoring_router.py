"""
Course authoring AI router — 镜像 ``ai-course-authoring.routes.ts``.

7 个 endpoint:
  POST /generate-course-blueprint
  POST /create-course-chat
  POST /extract-course
  POST /refine-course-blueprint
  POST /generate-lesson-blocks
  POST /generate-lesson-block
  POST /refine-lesson-block
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines import (
    chat_create_course,
    extract_course,
    generate_all_lesson_blocks,
    generate_course_blueprint,
    generate_single_lesson_block,
    refine_course_blueprint,
    refine_lesson_block,
)
from app.api.v1.ai.schemas import (
    ContentExtractRequest,
    CourseBlueprintRequest,
    GenerateLessonBlocksRequest,
    GenerateSingleLessonBlockRequest,
    MessagesOnlyRequest,
    RefineCourseBlueprintRequest,
    RefineLessonBlockRequest,
)
from app.api.v1.ai.shared import require_admin_or_counselor
from app.core.database import get_db
from app.lib.errors import ValidationError
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


@router.post("/generate-course-blueprint")
async def generate_course_blueprint_endpoint(
    org_id: str,
    body: CourseBlueprintRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.requirements:
        raise ValidationError("requirements is required")
    blueprint = await generate_course_blueprint(
        db, org_id=org_id, user_id=user.id, requirements=body.requirements
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-course-blueprint",
        ip_address=request.client.host if request.client else None,
    )
    return blueprint


@router.post("/create-course-chat")
async def create_course_chat_endpoint(
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
    result = await chat_create_course(
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
        resource="create-course-chat",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/extract-course")
async def extract_course_endpoint(
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
    result = await extract_course(db, org_id=org_id, user_id=user.id, content=body.content)
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="extract-course",
        ip_address=request.client.host if request.client else None,
    )
    return result


@router.post("/refine-course-blueprint")
async def refine_course_blueprint_endpoint(
    org_id: str,
    body: RefineCourseBlueprintRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.current_blueprint:
        raise ValidationError("currentBlueprint is required")
    if not body.instruction:
        raise ValidationError("instruction is required")
    refined = await refine_course_blueprint(
        db,
        org_id=org_id,
        user_id=user.id,
        current_blueprint=body.current_blueprint,
        instruction=body.instruction,
        requirements=body.requirements,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="refine-course-blueprint",
        ip_address=request.client.host if request.client else None,
    )
    return refined


@router.post("/generate-lesson-blocks")
async def generate_lesson_blocks_endpoint(
    org_id: str,
    body: GenerateLessonBlocksRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.blueprint:
        raise ValidationError("blueprint is required")
    if body.session_index is None:
        raise ValidationError("sessionIndex is required")
    blocks = await generate_all_lesson_blocks(
        db,
        org_id=org_id,
        user_id=user.id,
        blueprint=body.blueprint,
        session_index=body.session_index,
        requirements=body.requirements,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-lesson-blocks",
        ip_address=request.client.host if request.client else None,
    )
    return {"blocks": blocks}


@router.post("/generate-lesson-block")
async def generate_lesson_block_endpoint(
    org_id: str,
    body: GenerateSingleLessonBlockRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.blueprint:
        raise ValidationError("blueprint is required")
    if not body.block_type:
        raise ValidationError("blockType is required")
    content = await generate_single_lesson_block(
        db,
        org_id=org_id,
        user_id=user.id,
        blueprint=body.blueprint,
        session_index=body.session_index,
        block_type=body.block_type,
        existing_blocks=body.existing_blocks,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="generate-lesson-block",
        ip_address=request.client.host if request.client else None,
    )
    return {"content": content}


@router.post("/refine-lesson-block")
async def refine_lesson_block_endpoint(
    org_id: str,
    body: RefineLessonBlockRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    require_admin_or_counselor(org)
    if not body.block_content:
        raise ValidationError("blockContent is required")
    if not body.instruction:
        raise ValidationError("instruction is required")
    content = await refine_lesson_block(
        db,
        org_id=org_id,
        user_id=user.id,
        block_content=body.block_content,
        instruction=body.instruction,
        blueprint=body.blueprint,
        session_index=body.session_index,
    )
    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="ai_call",
        resource="refine-lesson-block",
        ip_address=request.client.host if request.client else None,
    )
    return {"content": content}


__all__ = ["router"]
