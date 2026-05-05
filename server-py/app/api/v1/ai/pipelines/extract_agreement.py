"""``extract-agreement.ts`` — 文本 → 协议模板。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def extract_agreement(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    content: str,
) -> dict[str, Any]:
    _ = content
    stub: dict[str, Any] = {"title": "", "sections": [], "consents": []}
    return await call_llm_for_pipeline(
        db, org_id=org_id, user_id=user_id, pipeline="extract-agreement", stub_result=stub
    )


__all__ = ["extract_agreement"]
