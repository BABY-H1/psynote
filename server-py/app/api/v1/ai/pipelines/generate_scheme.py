"""``generate-scheme.ts`` — 团辅方案生成 (整体 + 单 session 细节 + refine 各 1 个)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def generate_group_scheme(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    prompt: str,
) -> dict[str, Any]:
    _ = prompt
    stub: dict[str, Any] = {"title": "", "objectives": [], "sessions": []}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="generate-scheme", stub_result=stub
    )


async def generate_group_scheme_overall(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    prompt: str,
) -> dict[str, Any]:
    _ = prompt
    stub: dict[str, Any] = {"title": "", "outline": []}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="generate-scheme-overall", stub_result=stub
    )


async def generate_group_session_detail(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    overall_scheme: dict[str, Any],
    session_index: int,
    prompt: str | None = None,
) -> dict[str, Any]:
    _ = (overall_scheme, session_index, prompt)
    stub: dict[str, Any] = {"sessionTitle": "", "activities": [], "duration": 0}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="generate-session-detail", stub_result=stub
    )


async def refine_group_scheme_overall(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    current_scheme: dict[str, Any],
    instruction: str,
) -> dict[str, Any]:
    _ = (current_scheme, instruction)
    stub: dict[str, Any] = dict(current_scheme)
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="refine-scheme-overall", stub_result=stub
    )


async def refine_group_session_detail(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    current_session: dict[str, Any],
    overall_scheme: dict[str, Any],
    session_index: int,
    instruction: str,
) -> dict[str, Any]:
    _ = (overall_scheme, session_index, instruction)
    stub: dict[str, Any] = dict(current_session)
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="refine-session-detail", stub_result=stub
    )


__all__ = [
    "generate_group_scheme",
    "generate_group_scheme_overall",
    "generate_group_session_detail",
    "refine_group_scheme_overall",
    "refine_group_session_detail",
]
