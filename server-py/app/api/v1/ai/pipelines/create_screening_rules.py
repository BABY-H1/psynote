"""``create-screening-rules.ts`` — 多轮对话生成筛查规则。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def chat_configure_screening_rules(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    messages: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    _ = (messages, context)
    stub: dict[str, Any] = {"reply": "Phase 3 stub", "rules": None, "complete": False}
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="create-screening-rules",
        stub_result=stub,
    )


__all__ = ["chat_configure_screening_rules"]
