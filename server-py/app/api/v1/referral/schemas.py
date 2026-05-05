"""Referral API request/response schemas — 镜像 ``server/src/modules/referral/``.

所有 schema 走 ``CamelModel``: wire camelCase, Python snake_case。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── 数据包 spec (Phase 9δ) ─────────────────────────────────────────


class DataPackageSpec(CamelModel):
    """``referrals.data_package_spec`` JSONB 形状.

    镜像 referral.service.ts:20-26。咨询师选哪些临床记录共享给接收方。
    """

    session_note_ids: list[str] | None = None
    assessment_result_ids: list[str] | None = None
    treatment_plan_ids: list[str] | None = None
    include_chief_complaint: bool | None = None
    include_risk_history: bool | None = None


# ─── Create / Update inputs ─────────────────────────────────────────


class ReferralCreateInput(CamelModel):
    """``POST /`` 创建 referral body (镜像 referral.routes.ts:31-41)."""

    care_episode_id: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    risk_summary: str | None = None
    target_type: str | None = None
    target_name: str | None = None
    target_contact: str | None = None
    follow_up_plan: str | None = None


class ReferralUpdateInput(CamelModel):
    """``PATCH /{referralId}`` body (镜像 referral.routes.ts:69-73)."""

    status: str | None = None
    follow_up_notes: str | None = None
    target_name: str | None = None
    target_contact: str | None = None


class ReferralExtendedCreateInput(CamelModel):
    """``POST /extended`` body (Phase 9δ, 镜像 routes.ts:88-101)."""

    care_episode_id: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    risk_summary: str | None = None
    mode: str = Field(min_length=1)  # 'platform' | 'external'
    to_counselor_id: str | None = None
    to_org_id: str | None = None
    target_type: str | None = None
    target_name: str | None = None
    target_contact: str | None = None
    data_package_spec: DataPackageSpec | None = None


class ReferralRespondInput(CamelModel):
    """``POST /{referralId}/respond`` body — receiver 决定 (镜像 routes.ts:140-145)."""

    decision: str = Field(min_length=1)  # 'accept' | 'reject'
    reason: str | None = None


# ─── Output ─────────────────────────────────────────────────────────


class ReferralOutput(CamelModel):
    """单个 referral 输出 — 完整 row 投影."""

    id: str
    org_id: str
    care_episode_id: str
    client_id: str
    referred_by: str
    reason: str
    risk_summary: str | None = None
    target_type: str | None = None
    target_name: str | None = None
    target_contact: str | None = None
    status: str = "pending"
    follow_up_plan: str | None = None
    follow_up_notes: str | None = None
    mode: str = "external"
    to_counselor_id: str | None = None
    to_org_id: str | None = None
    data_package_spec: dict[str, Any] = Field(default_factory=dict)
    consented_at: datetime | None = None
    accepted_at: datetime | None = None
    rejected_at: datetime | None = None
    rejection_reason: str | None = None
    download_token: str | None = None
    download_expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


__all__ = [
    "DataPackageSpec",
    "ReferralCreateInput",
    "ReferralExtendedCreateInput",
    "ReferralOutput",
    "ReferralRespondInput",
    "ReferralUpdateInput",
]
