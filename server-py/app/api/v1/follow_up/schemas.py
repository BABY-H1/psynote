"""
Follow-up 模块 API schemas (Pydantic v2)。

镜像 ``server/src/modules/follow-up/follow-up.{routes,service}.ts`` 的 wire 形状
(camelCase, 与 Node 合约对齐):

  Plans:
    - GET    /plans              → list[FollowUpPlanRow]
    - POST   /plans              → FollowUpPlanRow
    - PATCH  /plans/{plan_id}    → FollowUpPlanRow

  Reviews:
    - GET    /reviews?careEpisodeId  → list[FollowUpReviewRow]
    - POST   /reviews                → FollowUpReviewRow

业务表:
  - ``follow_up_plans``    随访计划 (一行 = 一个 episode 的随访方案 + 频率 + 下次到期)
  - ``follow_up_reviews``  随访执行 (一行 = 一次执行 + risk before/after + decision)
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── plans ──────────────────────────────────────────────────────


class FollowUpPlanRow(CamelModel):
    """``follow_up_plans`` 行 (镜像 db schema + service.ts:50-72 returning row)。"""

    id: str
    org_id: str
    care_episode_id: str
    counselor_id: str
    plan_type: str | None = None
    assessment_id: str | None = None
    frequency: str | None = None
    next_due: str | None = None
    status: str = "active"
    notes: str | None = None
    created_at: str | None = None


class CreateFollowUpPlanRequest(CamelModel):
    """``POST /plans`` 请求 (镜像 routes.ts:24-47)。"""

    care_episode_id: str
    plan_type: str | None = None
    assessment_id: str | None = None
    frequency: str | None = None
    next_due: str | None = None
    notes: str | None = None


class UpdateFollowUpPlanRequest(CamelModel):
    """``PATCH /plans/{plan_id}`` 请求 (镜像 routes.ts:54-72)。"""

    frequency: str | None = None
    next_due: str | None = None
    status: str | None = None
    notes: str | None = None


# ─── reviews ────────────────────────────────────────────────────


# decision 取值与 Node service.ts:145-150 ``decisionLabels`` key 集一致
ReviewDecision = Literal["continue", "escalate", "deescalate", "close"]


class FollowUpReviewRow(CamelModel):
    """``follow_up_reviews`` 行 (镜像 db schema + service.ts:114-123 returning row)。"""

    id: str
    plan_id: str
    care_episode_id: str
    counselor_id: str
    review_date: str | None = None
    result_id: str | None = None
    risk_before: str | None = None
    risk_after: str | None = None
    clinical_note: str | None = None
    decision: str | None = None
    created_at: str | None = None


class CreateFollowUpReviewRequest(CamelModel):
    """``POST /reviews`` 请求 (镜像 routes.ts:84-110)。"""

    plan_id: str
    care_episode_id: str
    result_id: str | None = None
    risk_before: str | None = None
    risk_after: str | None = None
    clinical_note: str | None = None
    decision: str | None = None  # 不强制 Literal — Node 也是 string 自由


# ─── 列表查询参数 ─────────────────────────────────────────────


class ListPlansQuery(CamelModel):
    """``GET /plans?careEpisodeId=...`` 查询参数 (镜像 routes.ts:18-21)。"""

    care_episode_id: str | None = Field(default=None)


__all__ = [
    "CreateFollowUpPlanRequest",
    "CreateFollowUpReviewRequest",
    "FollowUpPlanRow",
    "FollowUpReviewRow",
    "ListPlansQuery",
    "ReviewDecision",
    "UpdateFollowUpPlanRequest",
]
