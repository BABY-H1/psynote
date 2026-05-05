"""
Workflow API 请求 / 响应 schemas (Pydantic v2).

镜像 ``server/src/modules/workflow/workflow.routes.ts`` (436 行) 的 JSON shape —
client / portal 仍调旧合约 (camelCase), 故所有 schema 走 ``CamelModel`` (alias_generator
=to_camel + populate_by_name=True): 内部 Python 用 snake_case, JSON wire 用 camelCase。

涵盖 3 块 schemas:
  - WorkflowRule core (CRUD + sync + execution)
  - WorkflowCondition / WorkflowAction (规则元素, JSONB 子结构)
  - CandidatePool (列表 + accept/dismiss)

强类型枚举 (Literal):
  - ``WorkflowTriggerEvent``: 触发事件 (Phase 12 MVP 只支持 1 个)
  - ``WorkflowConditionOperator``: 比较运算符 7 个
  - ``WorkflowActionType``: 动作类型 5 个
  - ``WorkflowExecutionStatus``: 执行结果 4 个
  - ``CandidateKind``: 候选分类 4 个
  - ``CandidatePriority``: 优先级 4 个
  - ``CandidateStatus``: 候选状态 4 个
  - ``WorkflowRuleSource``: 规则来源 (manual / assessment_wizard)

镜像 Node ``packages/shared/src/types/workflow.ts`` + ``candidate.ts`` 的字符串 union。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── 强类型枚举 (Literal) ──────────────────────────────────────────

WorkflowTriggerEvent = Literal["assessment_result.created"]
"""Phase 12 MVP 仅支持 ``assessment_result.created``. 后续扩展时增加 union 成员。"""

WorkflowConditionOperator = Literal["eq", "neq", "in", "not_in", "gte", "lte", "gt", "lt"]
"""规则条件比较运算符. Python 实现见 ``rule_engine_service._evaluate_one``。"""

WorkflowActionType = Literal[
    "assign_course",
    "create_episode_candidate",
    "create_group_candidate",
    "create_course_candidate",
    "create_crisis_candidate",
    "notify_internal",
]
"""规则动作类型. 仅 ``assign_course`` 自动执行, 其余写 ``candidate_pool`` 候选."""

WorkflowExecutionStatus = Literal["success", "partial", "failed", "skipped"]
"""规则执行结果. ``skipped`` = 条件未匹配; ``partial`` = 部分动作成功部分失败."""

WorkflowRuleSource = Literal["manual", "assessment_wizard"]
"""规则来源: ``manual`` = 手工新建 (rule editor UI); ``assessment_wizard`` = 测评向导自动同步。"""

CandidateKind = Literal[
    "episode_candidate",
    "group_candidate",
    "course_candidate",
    "crisis_candidate",
]
"""候选分类, 决定卡片 UI + accepted 后建什么实体."""

CandidatePriority = Literal["low", "normal", "high", "urgent"]

CandidateStatus = Literal["pending", "accepted", "dismissed", "expired"]


# ─── WorkflowCondition / WorkflowAction (JSONB 子结构) ──────────


class WorkflowCondition(CamelModel):
    """规则条件 (镜像 Node ``WorkflowCondition``).

    支持静态字段 (``risk_level``, ``assessment_id``, ``org_type``, ``total_score``) 和动态前缀
    (``dimension_score:<dimensionId>``, ``item_value:<itemId>``).
    """

    field: str
    operator: WorkflowConditionOperator
    value: Any  # str | int | float | list — Node 端是 unknown


class WorkflowAction(CamelModel):
    """规则动作 (镜像 Node ``WorkflowAction``)."""

    type: WorkflowActionType
    config: dict[str, Any] | None = None


class WorkflowActionResult(CamelModel):
    """单个动作执行结果. ``actions_result`` 数组每行一条."""

    action_type: WorkflowActionType
    status: Literal["success", "failed", "skipped"]
    detail: str | None = None
    ref_id: str | None = None  # 创建的 candidate / enrollment id


# ─── WorkflowRule ────────────────────────────────────────────────


class WorkflowRuleCreateRequest(CamelModel):
    """``POST /rules`` body. 镜像 routes.ts:73-84."""

    name: str = Field(min_length=1)
    description: str | None = None
    trigger_event: WorkflowTriggerEvent
    conditions: list[WorkflowCondition] = Field(default_factory=list)
    actions: list[WorkflowAction] = Field(default_factory=list)
    is_active: bool = True
    priority: int = 0
    scope_assessment_id: str | None = None
    source: WorkflowRuleSource = "manual"


class WorkflowRuleUpdateRequest(CamelModel):
    """``PATCH /rules/{rule_id}`` body. 镜像 routes.ts:191-198."""

    name: str | None = None
    description: str | None = None
    conditions: list[WorkflowCondition] | None = None
    actions: list[WorkflowAction] | None = None
    is_active: bool | None = None
    priority: int | None = None


class WorkflowRuleSyncEntry(CamelModel):
    """``PUT /rules/by-assessment/{aid}`` body 的单条规则。"""

    name: str = Field(min_length=1)
    description: str | None = None
    conditions: list[WorkflowCondition] = Field(default_factory=list)
    actions: list[WorkflowAction] = Field(default_factory=list)
    is_active: bool = True
    priority: int = 0


class WorkflowRuleSyncRequest(CamelModel):
    """``PUT /rules/by-assessment/{aid}`` body."""

    rules: list[WorkflowRuleSyncEntry] = Field(default_factory=list)


class WorkflowRuleSyncResponse(CamelModel):
    """``PUT /rules/by-assessment/{aid}`` 返回."""

    count: int


class WorkflowRuleRow(CamelModel):
    """``GET /rules`` 列表项 + ``GET /rules/{id}`` 单条 + 创建/更新返回。"""

    id: str
    org_id: str
    scope_assessment_id: str | None = None
    name: str
    description: str | None = None
    trigger_event: WorkflowTriggerEvent
    conditions: list[WorkflowCondition] = Field(default_factory=list)
    actions: list[WorkflowAction] = Field(default_factory=list)
    is_active: bool = True
    priority: int = 0
    source: WorkflowRuleSource = "manual"
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── WorkflowExecution ───────────────────────────────────────────


class WorkflowExecutionRow(CamelModel):
    """``GET /executions`` 列表项. 镜像 ``workflow_executions`` 表."""

    id: str
    org_id: str
    rule_id: str | None = None
    trigger_event: str
    event_payload: dict[str, Any] = Field(default_factory=dict)
    conditions_matched: bool = False
    actions_result: list[dict[str, Any]] = Field(default_factory=list)
    status: WorkflowExecutionStatus
    error_message: str | None = None
    created_at: datetime | None = None


# ─── CandidatePool (router 端 / queries_service 端复用) ─────────


class CandidateRow(CamelModel):
    """``GET /candidates`` 列表项 (含 user.name / user.email join)."""

    id: str
    org_id: str
    client_user_id: str
    client_name: str | None = None
    client_email: str | None = None
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


class CandidateAcceptRequest(CamelModel):
    """``POST /candidates/{id}/accept`` body."""

    resolved_ref_type: str | None = None
    resolved_ref_id: str | None = None
    note: str | None = None


class CandidateAcceptResponse(CandidateRow):
    """``POST /candidates/{id}/accept`` 返回, 比 CandidateRow 多 ``episode_id`` /
    ``crisis_case_id`` (前端 navigate 用).

    特殊 kind=``crisis_candidate`` 时原子建 careEpisode + crisis_case (Phase J);
    特殊 kind=``episode_candidate`` 且 ``resolvedRefType=care_episode`` 时建 careEpisode
    (Phase H BUG-007 修复).
    """

    episode_id: str | None = None
    crisis_case_id: str | None = None


class CandidateDismissRequest(CamelModel):
    """``POST /candidates/{id}/dismiss`` body."""

    reason: str | None = None


# ─── 共用 ──────────────────────────────────────────────────────


class OkResponse(CamelModel):
    ok: bool = True


__all__ = [
    "CandidateAcceptRequest",
    "CandidateAcceptResponse",
    "CandidateDismissRequest",
    "CandidateKind",
    "CandidatePriority",
    "CandidateRow",
    "CandidateStatus",
    "OkResponse",
    "WorkflowAction",
    "WorkflowActionResult",
    "WorkflowActionType",
    "WorkflowCondition",
    "WorkflowConditionOperator",
    "WorkflowExecutionRow",
    "WorkflowExecutionStatus",
    "WorkflowRuleCreateRequest",
    "WorkflowRuleRow",
    "WorkflowRuleSource",
    "WorkflowRuleSyncEntry",
    "WorkflowRuleSyncRequest",
    "WorkflowRuleSyncResponse",
    "WorkflowRuleUpdateRequest",
    "WorkflowTriggerEvent",
]
