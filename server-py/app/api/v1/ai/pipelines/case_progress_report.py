"""``case-progress-report.ts`` 镜像 — 个案进展报告 (聚合 sessions + assessments)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def case_progress_report(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    episode_id: str,
) -> dict[str, Any]:
    _ = episode_id
    stub: dict[str, Any] = {
        "narrative": "Phase 3 stub — Phase 5 will weave sessions + assessments.",
        "milestones": [],
        "metrics": {},
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="case-progress-report",
        stub_result=stub,
    )


__all__ = ["case_progress_report"]
