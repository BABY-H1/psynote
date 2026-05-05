"""``client-summary.ts`` 镜像 — 来访者画像 / 风险总览 (调 counseling.client_summary.service)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def client_summary(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    client_id: str,
    episode_id: str,
) -> dict[str, Any]:
    """来访者画像 — Phase 5 真接 LLM 时拉 counseling.services.build_client_summary_input."""
    _ = (client_id, episode_id)
    stub: dict[str, Any] = {
        "summary": "Phase 3 stub",
        "riskProfile": {},
        "history": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="client-summary",
        stub_result=stub,
    )


__all__ = ["client_summary"]
