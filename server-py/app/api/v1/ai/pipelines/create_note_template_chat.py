"""``create-note-template-chat.ts`` — 多轮对话创建 note 模板。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def chat_create_note_template(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    _ = messages
    stub: dict[str, Any] = {"reply": "Phase 3 stub", "draft": None, "complete": False}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="create-note-template-chat", stub_result=stub
    )


__all__ = ["chat_create_note_template"]
