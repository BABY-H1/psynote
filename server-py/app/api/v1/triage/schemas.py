"""
Triage API 请求 / 响应 schemas (Pydantic v2).

镜像 ``server/src/modules/triage/triage.routes.ts`` (121 行) 的 JSON shape — client / portal
仍调旧合约 (camelCase), 故所有 schema 走 ``CamelModel``。

涵盖:
  - ``TriageCandidateRow``: ``GET /candidates`` 列表项 (跨 screening + manual + service candidate)
  - ``TriageBuckets``: ``GET /buckets`` L1-L4 + unrated 计数
  - ``TriageRiskLevelPatchRequest``: ``PATCH /results/{result_id}/risk-level`` body
  - ``TriageLazyCandidateRequest``: ``POST /results/{result_id}/candidate`` body (Phase H BUG-007)
  - ``ServiceCandidateRow``: ``listCandidatesForService`` 反查行 (group/course)
  - ``CandidatePoolRow``: ``lazy_create_candidate`` 返回的 candidate_pool 行

强类型枚举 (Literal):
  - ``TriageMode``: 列表 mode 'screening' | 'manual' | 'all'
  - ``TriageCandidateSource``: 'screening' | 'manual'
  - ``RiskLevel``: level_1 ~ level_4 (与 Node ``RISK_LEVEL`` 一致)
  - ``CandidateKind`` / ``CandidatePriority``: 同 workflow schemas

注: 内部 enums 故意与 ``app/api/v1/workflow/schemas`` 保持解耦, 避免 triage 模块强依赖 workflow.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── 枚举 ──────────────────────────────────────────────────────

TriageMode = Literal["screening", "manual", "all"]
"""列表查询模式. ``screening`` 默认, 看 assessment_results 中筛查类型测评; ``manual``
看 candidate_pool 中手工添加 (sourceRuleId IS NULL); ``all`` 联合并按 createdAt desc."""

TriageCandidateSource = Literal["screening", "manual"]

RiskLevel = Literal["level_1", "level_2", "level_3", "level_4"]

CandidateKind = Literal[
    "episode_candidate",
    "group_candidate",
    "course_candidate",
    "crisis_candidate",
]

CandidatePriority = Literal["low", "normal", "high", "urgent"]

CandidateStatus = Literal["pending", "accepted", "dismissed", "expired"]


# ─── TriageCandidateRow / TriageBuckets ──────────────────────────


class TriageCandidateRow(CamelModel):
    """``GET /candidates`` 列表项 — de-normalised view-model.

    Source 区分 (``screening`` vs ``manual``) 让前端 badge 知道这条是规则引擎产物
    还是手工添加. ``resultId`` / ``candidateId`` 一个或都填充, 看来源.
    """

    source: TriageCandidateSource
    result_id: str | None = None
    candidate_id: str | None = None
    user_id: str | None = None
    user_name: str | None = None
    assessment_id: str | None = None
    assessment_title: str | None = None
    assessment_type: str
    risk_level: str | None = None
    total_score: str | None = None  # Drizzle 那边走 numeric → str, Python 也保持 str 兼容
    batch_id: str | None = None
    candidate_status: str | None = None
    candidate_kind: str | None = None
    suggestion: str | None = None
    priority: str | None = None
    latest_episode_id: str | None = None
    resolved_ref_type: str | None = None
    resolved_ref_id: str | None = None
    created_at: datetime


class TriageBuckets(CamelModel):
    """``GET /buckets`` 计数响应. 5 个 bucket: L1-L4 + 未评级 (riskLevel IS NULL)."""

    level_1: int = 0
    level_2: int = 0
    level_3: int = 0
    level_4: int = 0
    unrated: int = 0


# ─── PATCH /results/{result_id}/risk-level body ─────────────────


class TriageRiskLevelPatchRequest(CamelModel):
    """``PATCH /results/{result_id}/risk-level`` body. 镜像 routes.ts:24-27."""

    risk_level: RiskLevel
    reason: str | None = None


class TriageRiskLevelPatchResponse(CamelModel):
    id: str
    risk_level: str | None = None


# ─── POST /results/{result_id}/candidate body (Phase H BUG-007) ──


class TriageLazyCandidateRequest(CamelModel):
    """``POST /results/{result_id}/candidate`` body. 镜像 routes.ts:29-32.

    Phase H — BUG-007 真正修复: 把 result 懒转成 candidate_pool 行.
    """

    kind: CandidateKind
    priority: CandidatePriority | None = None


class CandidatePoolRow(CamelModel):
    """``lazy_create_candidate`` 返回的 ``candidate_pool`` 行."""

    id: str
    org_id: str
    client_user_id: str
    kind: CandidateKind
    suggestion: str
    reason: str | None = None
    priority: CandidatePriority = "normal"
    source_rule_id: str | None = None
    source_result_id: str | None = None
    source_payload: dict[str, Any] | None = None
    status: CandidateStatus = "pending"
    assigned_to_user_id: str | None = None
    handled_by_user_id: str | None = None
    handled_at: datetime | None = None
    handled_note: str | None = None
    resolved_ref_type: str | None = None
    resolved_ref_id: str | None = None
    created_at: datetime | None = None


# ─── listCandidatesForService 反查 ──────────────────────────


class ServiceCandidateRow(CamelModel):
    """反查"哪些候选目标是这个 group/course instance?" 用在 GroupInstanceDetail /
    CourseInstanceDetail 候选 tab.
    """

    candidate_id: str
    kind: str
    user_id: str
    user_name: str | None = None
    suggestion: str
    reason: str | None = None
    priority: str
    status: str
    source_result_id: str | None = None
    source_rule_id: str | None = None
    created_at: datetime


# ─── 内部用 (queries_service 内部 row 形态) ────────────────


class TriageListOpts(CamelModel):
    """``list_triage_candidates`` 参数.

    Pydantic model 而不是 dataclass — 避免 keyword-arg-only 太多, 也方便 router 直接
    构造 (跟 Node 端 ``TriageListOpts`` 接口对齐).
    """

    mode: TriageMode = "screening"
    batch_id: str | None = None
    assessment_id: str | None = None
    level: str | None = None
    counselor_id: str | None = None
    # scope 单独传 — DataScope 不是 CamelModel; router 层从 Depends(get_data_scope) 拿


# ─── 共用 ──────────────────────────────────────────────────


class OkResponse(CamelModel):
    ok: bool = True


# 让 lint 不警告 unused imports
_ = (Decimal, Field)


__all__ = [
    "CandidateKind",
    "CandidatePoolRow",
    "CandidatePriority",
    "CandidateStatus",
    "OkResponse",
    "RiskLevel",
    "ServiceCandidateRow",
    "TriageBuckets",
    "TriageCandidateRow",
    "TriageCandidateSource",
    "TriageLazyCandidateRequest",
    "TriageListOpts",
    "TriageMode",
    "TriageRiskLevelPatchRequest",
    "TriageRiskLevelPatchResponse",
]
