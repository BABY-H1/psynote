"""``triage.ts`` 镜像 — 分流推荐。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def recommend_triage(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    """分流推荐 — Phase 5 接真 LLM."""
    _ = input_
    stub: dict[str, Any] = {
        "primaryIntervention": "course",
        "rationale": "Phase 3 stub — Phase 5 will analyze risk + dimensions to recommend.",
        "alternatives": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="triage",
        stub_result=stub,
    )


__all__ = ["recommend_triage"]
