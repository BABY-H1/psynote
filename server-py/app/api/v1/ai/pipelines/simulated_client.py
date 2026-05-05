"""``simulated-client.ts`` 镜像 — 模拟来访对话 (training)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def simulated_client_chat(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    messages: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    _ = (messages, context)
    stub: dict[str, Any] = {
        "reply": "Phase 3 stub simulated-client response.",
        "characterState": {},
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="simulated-client",
        stub_result=stub,
    )


__all__ = ["simulated_client_chat"]
