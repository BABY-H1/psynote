"""``soap-analysis.ts`` 镜像 — 会谈记录 SOAP 分析。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def analyze_soap(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    """SOAP 分析 — Phase 5 接真 LLM."""
    _ = input_
    stub: dict[str, Any] = {
        "themes": [],
        "concerns": [],
        "questionsToExplore": [],
        "summary": "Phase 3 stub — Phase 5 will analyze SOAP fields.",
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="soap-analysis",
        stub_result=stub,
    )


__all__ = ["analyze_soap"]
