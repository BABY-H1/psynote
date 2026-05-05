"""``interpretation.ts`` 镜像 — 量表结果解读。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def interpret_result(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> str:
    """量表解读 — 返回字符串。Phase 5 替换 stub。"""
    _ = input_
    stub = "Phase 3 stub — Phase 5 will produce a clinical interpretation paragraph."
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="interpretation",
        stub_result=stub,
        stub_kind="string",
    )


__all__ = ["interpret_result"]
