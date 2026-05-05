"""``poster-copy.ts`` 镜像 — 团辅 / 课程海报营销文案。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def generate_poster_copy(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    _ = input_
    stub: dict[str, Any] = {
        "headline": "",
        "subtitle": "",
        "points": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="poster-copy",
        stub_result=stub,
    )


__all__ = ["generate_poster_copy"]
