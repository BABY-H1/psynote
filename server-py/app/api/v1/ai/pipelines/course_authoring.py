"""``course-authoring.ts`` — 课程蓝图 + lesson 块生成 / 优化。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def generate_course_blueprint(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    requirements: dict[str, Any],
) -> dict[str, Any]:
    _ = requirements
    stub: dict[str, Any] = {"title": "", "lessons": [], "objectives": []}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="generate-course-blueprint", stub_result=stub
    )


async def refine_course_blueprint(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    current_blueprint: dict[str, Any],
    instruction: str,
    requirements: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ = (instruction, requirements)
    stub: dict[str, Any] = dict(current_blueprint)
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="refine-course-blueprint", stub_result=stub
    )


async def generate_all_lesson_blocks(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    blueprint: dict[str, Any],
    session_index: int,
    requirements: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    _ = (blueprint, session_index, requirements)
    stub: list[dict[str, Any]] = []
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="generate-lesson-blocks", stub_result=stub
    )


async def generate_single_lesson_block(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    blueprint: dict[str, Any],
    session_index: int,
    block_type: str,
    existing_blocks: list[dict[str, Any]] | None = None,
) -> str:
    _ = (blueprint, session_index, block_type, existing_blocks)
    stub = "Phase 3 stub lesson block."
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="generate-lesson-block",
        stub_result=stub,
        stub_kind="string",
    )


async def refine_lesson_block(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    block_content: str,
    instruction: str,
    blueprint: dict[str, Any] | None = None,
    session_index: int | None = None,
) -> str:
    _ = (instruction, blueprint, session_index)
    stub = block_content  # Phase 5 真改写
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="refine-lesson-block",
        stub_result=stub,
        stub_kind="string",
    )


__all__ = [
    "generate_all_lesson_blocks",
    "generate_course_blueprint",
    "generate_single_lesson_block",
    "refine_course_blueprint",
    "refine_lesson_block",
]
