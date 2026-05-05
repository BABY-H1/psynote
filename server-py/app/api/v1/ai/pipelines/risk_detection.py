"""``risk-detection.ts`` 镜像 — AI 风险研判 (BYOK 调用点 + Phase 5 业务接 LLM)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def assess_risk(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    """风险研判 — 镜像 Node ``assessRisk(input, track)``。

    Phase 3 stub: 返回 mock 风险结果, BYOK 调用点真接通。
    Phase 5: 替换 stub_result 为 ``await client.generate_json(SYSTEM, USER, opts)``.
    """
    _ = input_  # Phase 5 用
    stub: dict[str, Any] = {
        "riskLevel": "level_1",
        "confidence": 0.5,
        "summary": "Phase 3 stub — real risk analysis arrives in Phase 5.",
        "factors": [],
        "recommendations": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="risk-detection",
        stub_result=stub,
    )


__all__ = ["assess_risk"]
