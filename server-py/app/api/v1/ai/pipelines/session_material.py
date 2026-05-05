"""``session-material.ts`` 镜像 — 原始素材 → SOAP / 自定义格式。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.ai.pipelines._base import call_llm_for_pipeline


async def analyze_session_material(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    _ = input_
    stub: dict[str, Any] = {
        "subjective": "",
        "objective": "",
        "assessment": "Phase 3 stub",
        "plan": "",
    }
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="session-material",
        stub_result=stub,
    )


async def analyze_session_material_for_format(
    db: AsyncSession,
    *,
    org_id: str | UUID,
    user_id: str | UUID,
    input_: dict[str, Any],
) -> dict[str, Any]:
    """格式化 (按 fieldDefinitions 抽出 KV)。"""
    field_defs = input_.get("fieldDefinitions") or []
    stub: dict[str, Any] = {fd.get("key", f"field{i}"): "" for i, fd in enumerate(field_defs)}
    return await call_llm_for_pipeline(
        db,
        org_id=org_id,
        user_id=user_id,
        pipeline="session-material-formatted",
        stub_result=stub,
    )


__all__ = ["analyze_session_material", "analyze_session_material_for_format"]
