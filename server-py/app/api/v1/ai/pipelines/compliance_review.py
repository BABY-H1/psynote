"""``compliance-review.ts`` 镜像 — 合规审查 (note / agreement 文本)。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def compliance_review(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    content: str,
    review_type: str = "note",
) -> dict[str, Any]:
    _ = (content, review_type)
    stub: dict[str, Any] = {
        "issues": [],
        "severity": "ok",
        "suggestions": [],
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="compliance-review",
        stub_result=stub,
    )


__all__ = ["compliance_review"]
