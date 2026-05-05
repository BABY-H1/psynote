"""Crisis API request/response schemas — 镜像 ``server/src/modules/crisis/``。

所有 schema 走 ``CamelModel``: wire camelCase, Python snake_case (与 Node 合约对齐)。

涵盖:
  - StepPayloadInput   PUT /cases/{caseId}/checklist/{stepKey} body (5 步通用)
  - SubmitInput        POST /cases/{caseId}/submit body
  - SignOffInput       POST /cases/{caseId}/sign-off body
  - CrisisCaseOutput   单个 crisis_case 输出 (DTO, snake_case → wire camelCase)
  - 仪表板各分块输出 (cards / byCounselor / bySource / monthlyTrend / ...)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── checklist step payload (镜像 crisis-case.routes.ts:30-47) ───────


class StepPayloadInput(CamelModel):
    """``PUT /cases/{caseId}/checklist/{stepKey}`` body — 5 步通用 schema (passthrough).

    镜像 Node ``StepPayloadSchema`` (crisis-case.routes.ts:30-47): zod ``.passthrough()``
    意味字段都可选, 也允许未列字段穿透 (用于不同 stepKey 的差异字段)。
    Python 端等价: 所有字段 Optional + ``model_config`` 不阻止 extra (默认 allow)。
    """

    done: bool | None = None
    completed_at: str | None = None
    skipped: bool | None = None
    skip_reason: str | None = None
    # reinterview
    note_id: str | None = None
    summary: str | None = None
    # parentContact
    method: str | None = None  # 'phone' | 'wechat' | 'in_person' | 'other'
    contact_name: str | None = None
    contacted_at: str | None = None
    # documents
    document_ids: list[str] | None = None
    # referral / followUp
    referral_id: str | None = None
    follow_up_id: str | None = None


class SubmitInput(CamelModel):
    """``POST /cases/{caseId}/submit`` body — counselor 提交结案."""

    closure_summary: str = Field(min_length=1)


class SignOffInput(CamelModel):
    """``POST /cases/{caseId}/sign-off`` body — 督导 approve/bounce."""

    approve: bool
    supervisor_note: str | None = None


# ─── crisis_case DTO (镜像 crisis-helpers.ts:toCrisisCase) ──────────


class CrisisCaseOutput(CamelModel):
    """单个 crisis_case 输出. 镜像 Node ``CrisisCase`` 类型 (packages/shared/types).

    JSONB ``checklist`` 直接以 dict 透传 (5 步状态结构由前端解释)。
    """

    id: str
    org_id: str
    episode_id: str
    candidate_id: str | None = None
    stage: str = "open"  # 'open' | 'pending_sign_off' | 'closed' | 'reopened'
    checklist: dict[str, Any] = Field(default_factory=dict)
    closure_summary: str | None = None
    supervisor_note: str | None = None
    signed_off_by: str | None = None
    signed_off_at: datetime | None = None
    submitted_for_sign_off_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── dashboard outputs (镜像 crisis-dashboard.service.ts) ───────────


class DashboardCards(CamelModel):
    """仪表板顶部卡片计数 (镜像 crisis-dashboard.service.ts:172-179)."""

    total: int = 0
    open_count: int = 0
    pending_candidate_count: int = 0
    pending_sign_off_count: int = 0
    closed_this_month: int = 0
    reopened_count: int = 0


class DashboardByCounselor(CamelModel):
    """按咨询师分布行 (镜像 crisis-dashboard.service.ts:181-188)."""

    counselor_id: str | None = None
    counselor_name: str = "(未命名)"
    open_count: int = 0
    pending_count: int = 0
    closed_count: int = 0
    total: int = 0


class DashboardMonthlyTrendItem(CamelModel):
    """单月趋势 (镜像 crisis-dashboard.service.ts:196-200)."""

    month: str
    opened: int = 0
    closed: int = 0


class DashboardActivityItem(CamelModel):
    """最近 timeline 活动条目 (镜像 crisis-dashboard.service.ts:201-215)."""

    id: str
    event_type: str
    title: str | None = None
    summary: str | None = None
    care_episode_id: str
    created_at: str | None = None
    created_by_name: str | None = None
    client_name: str | None = None


class DashboardPendingItem(CamelModel):
    """待审核案件简表行 (镜像 crisis-dashboard.service.ts:216-228)."""

    case_id: str
    episode_id: str
    submitted_at: str | None = None
    counselor_name: str | None = None
    client_name: str | None = None
    closure_summary: str | None = None


class DashboardOutput(CamelModel):
    """``GET /stats`` 完整响应 (镜像 crisis-dashboard.service.ts:172-230)."""

    cards: DashboardCards = Field(default_factory=DashboardCards)
    by_counselor: list[DashboardByCounselor] = Field(default_factory=list)
    by_source: dict[str, int] = Field(default_factory=dict)
    monthly_trend: list[DashboardMonthlyTrendItem] = Field(default_factory=list)
    recent_activity: list[DashboardActivityItem] = Field(default_factory=list)
    pending_sign_off_list: list[DashboardPendingItem] = Field(default_factory=list)


__all__ = [
    "CrisisCaseOutput",
    "DashboardActivityItem",
    "DashboardByCounselor",
    "DashboardCards",
    "DashboardMonthlyTrendItem",
    "DashboardOutput",
    "DashboardPendingItem",
    "SignOffInput",
    "StepPayloadInput",
    "SubmitInput",
]
