"""``extract-goal.ts`` — 文本 → 治疗目标。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def extract_goal(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    content: str,
) -> dict[str, Any]:
    _ = content
    stub: dict[str, Any] = {"title": "", "description": "", "objectives": [], "interventions": []}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="extract-goal", stub_result=stub
    )


__all__ = ["extract_goal"]
