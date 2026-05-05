"""``note-guidance-chat.ts`` 镜像 — 引导式 note 撰写对话。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def note_guidance_chat(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    messages: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    _ = (messages, context)
    stub: dict[str, Any] = {
        "reply": "Phase 3 stub note guidance response.",
        "suggestedFields": {},
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="note-guidance-chat",
        stub_result=stub,
    )


__all__ = ["note_guidance_chat"]
