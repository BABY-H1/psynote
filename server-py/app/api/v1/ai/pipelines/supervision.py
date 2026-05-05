"""``supervision.ts`` 镜像 — 督导对话。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def supervision_chat(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    messages: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    """督导对话 — 多轮。Phase 5 接真 LLM。"""
    _ = (messages, context)
    stub: dict[str, Any] = {
        "reply": "Phase 3 stub supervision response.",
        "suggestions": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="supervision",
        stub_result=stub,
    )


__all__ = ["supervision_chat"]
