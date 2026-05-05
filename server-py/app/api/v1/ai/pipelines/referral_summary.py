"""``referral-summary.ts`` 镜像 — 转介摘要。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def generate_referral_summary(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> str:
    _ = input_
    stub = "Phase 3 stub — Phase 5 will produce a structured referral summary."
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="referral-summary",
        stub_result=stub,
        stub_kind="string",
    )


__all__ = ["generate_referral_summary"]
