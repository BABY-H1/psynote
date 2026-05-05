"""``recommendation.ts`` 镜像 — 个性化推荐 (client portal)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def generate_recommendations(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID | None,
    input_: dict[str, Any],
) -> dict[str, Any]:
    """个性化推荐 (Phase 5 接真 LLM, client portal 端点)。"""
    _ = input_
    stub: dict[str, Any] = {
        "recommendations": [],
        "summary": "Phase 3 stub — Phase 5 will rank courses + groups by user profile.",
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="recommendation",
        stub_result=stub,
    )


__all__ = ["generate_recommendations"]
