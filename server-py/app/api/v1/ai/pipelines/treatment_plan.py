"""``treatment-plan.ts`` 镜像 — 治疗计划建议。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def suggest_treatment_plan(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    _ = input_
    stub: dict[str, Any] = {
        "goals": [],
        "interventions": [],
        "approach": "",
        "rationale": "Phase 3 stub — Phase 5 will plan goals + interventions.",
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="treatment-plan",
        stub_result=stub,
    )


__all__ = ["suggest_treatment_plan"]
