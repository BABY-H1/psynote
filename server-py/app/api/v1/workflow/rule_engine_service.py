"""
Workflow Rule Engine — 镜像 ``server/src/modules/workflow/rule-engine.service.ts`` (452 行).

对外契约:

    await run_rules_for_event(
        db=db,
        org_id=...,
        event="assessment_result.created",
        payload=TriggerPayload(...),
        triggering_user_id=...,
    )

是 fire-and-forget 入口, 调用方 (e.g. assessment submit) 触发. 内部:
  1. 加载 ``workflow_rules`` 中 active + scope 匹配 + event 匹配的规则
     (按 priority desc 排序, 跨测评通用规则 ``scope_assessment_id IS NULL`` 也包括).
  2. 对每条规则: 评估 conditions (AND-joined) → 匹配则按序执行 actions.
  3. 写一行 ``workflow_executions`` 记录执行结果 (含跳过 / 部分 / 失败 / 成功).

与 ``app/api/v1/assessment/triage_automation_service.py`` (Tier 2 已写) 协作:
  - ``triage_automation_service``: 测评提交后无规则也保底跑的"硬"自动研判
    (level_3+ 通知, level_4 写危机候选). 是合规底线.
  - 本 service: 机构可选的"软"事件驱动框架, 跑用户配置的规则.
  - 两者都从 ``submit_result`` 里调用, 但互不依赖.

Action 安全设计:
  - **仅 ``assign_course`` 自动执行**: 课程报名是非强制的, 客户仍可决定是否参加.
  - 其他动作 (``create_*_candidate``, ``notify_internal``) 一律走 ``candidate_pool``
    或 ``notifications``, 不直接发短信 / 邮件 / 工单等对外联系.

错误处理 (与 Node ``console.warn`` 一致):
  - top-level swallow + log: ``run_rules_for_event`` 永不抛, 失败只 log.
  - per-action swallow: 单 action 失败不阻塞同规则其他 action, 也不阻塞下一条规则.
  - workflow_executions log 写失败也 swallow.

N+1 防范 (Phase 12+ 优化):
  - 单次 event 触发可能有多条规则, 每条 candidate 创建独立 INSERT — 这是合规要求
    (每个 candidate 独立审计), 不是 N+1 应规避的查询模式.
  - notify_internal 按 role 通知时用单查询拿 ``org_members``, 不在循环内 sub-query.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, cast

from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.workflow.schemas import (
    CandidateKind,
    CandidatePriority,
    WorkflowAction,
    WorkflowActionResult,
    WorkflowActionType,
    WorkflowCondition,
    WorkflowConditionOperator,
    WorkflowExecutionStatus,
    WorkflowTriggerEvent,
)
from app.db.models.candidate_pool import CandidatePool
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.course_instances import CourseInstance
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember
from app.db.models.workflow_executions import WorkflowExecution
from app.db.models.workflow_rules import WorkflowRule

logger = logging.getLogger(__name__)


# ─── Public API ──────────────────────────────────────────────────


class TriggerPayload(BaseModel):
    """触发事件 payload (镜像 Node ``TriggerPayload``).

    Notes:
      - ``dimension_scores`` keys = ``dimension_id`` (uuid str), engine 据此评估
        ``dimension_score:<dimensionId>`` 条件.
      - ``item_values`` maps ``itemId → value``, 评估 ``item_value:<id>`` 条件.
        由 ``triage_automation_service`` 从 ``assessment_results.answers`` 派生.
    """

    model_config = ConfigDict(populate_by_name=True)

    result_id: str
    user_id: str | None = None
    assessment_id: str
    risk_level: str
    total_score: float | None = None
    dimension_scores: dict[str, float] | None = None
    item_values: dict[str, float] | None = None
    org_type: str | None = None


# ─── 入口: run_rules_for_event ────────────────────────────────


async def run_rules_for_event(
    *,
    db: AsyncSession,
    org_id: str,
    event: WorkflowTriggerEvent,
    payload: TriggerPayload,
    triggering_user_id: str | None = None,
) -> None:
    """
    Fire-and-forget 入口. 任何错误 swallow + log, 不阻塞调用方.

    Args:
        db:                 AsyncSession (调用方 transaction 内, 由调用方决定 commit)
        org_id:             org UUID 字符串
        event:              触发事件 (Phase 12 MVP 仅 ``assessment_result.created``)
        payload:            事件 payload (含 result / user / assessment / risk_level)
        triggering_user_id: 触发用户 (可选, 用于 source 追踪)
    """
    _ = triggering_user_id  # 当前未使用, 保留接口形状

    try:
        org_uuid = uuid.UUID(org_id)
    except (ValueError, TypeError):
        logger.warning("[rule-engine] invalid org_id: %r", org_id)
        return

    try:
        rules = await _load_active_rules(
            db=db, org_uuid=org_uuid, event=event, assessment_id=payload.assessment_id
        )
        for rule in rules:
            await _execute_rule(db=db, rule=rule, org_uuid=org_uuid, event=event, payload=payload)
    except Exception:
        logger.exception("[rule-engine] top-level failure (non-blocking)")


# ─── 加载规则 (镜像 service.ts:90-129) ────────────────────────


async def _load_active_rules(
    *,
    db: AsyncSession,
    org_uuid: uuid.UUID,
    event: WorkflowTriggerEvent,
    assessment_id: str,
) -> list[WorkflowRule]:
    """加载 active rules. Scoping:
    - ``scope_assessment_id == payload.assessment_id`` → include
    - ``scope_assessment_id IS NULL`` → include (跨 assessment 通用)
    - 其他 → exclude (属于另一 assessment 的规则).
    """
    try:
        a_uuid = uuid.UUID(assessment_id)
    except (ValueError, TypeError):
        # 非法 assessment_id → 仅匹配 NULL scope 的全局规则
        scope_filter: Any = WorkflowRule.scope_assessment_id.is_(None)
    else:
        scope_filter = or_(
            WorkflowRule.scope_assessment_id == a_uuid,
            WorkflowRule.scope_assessment_id.is_(None),
        )

    q = (
        select(WorkflowRule)
        .where(
            and_(
                WorkflowRule.org_id == org_uuid,
                WorkflowRule.trigger_event == event,
                WorkflowRule.is_active.is_(True),
                scope_filter,
            )
        )
        .order_by(desc(WorkflowRule.priority))
    )
    return list((await db.execute(q)).scalars().all())


# ─── 执行单条规则 (service.ts:131-177) ─────────────────────────


async def _execute_rule(
    *,
    db: AsyncSession,
    rule: WorkflowRule,
    org_uuid: uuid.UUID,
    event: WorkflowTriggerEvent,
    payload: TriggerPayload,
) -> None:
    """评估 conditions → 匹配则按序执行 actions → 写一行 workflow_executions."""
    conditions = _parse_conditions(rule.conditions)
    actions = _parse_actions(rule.actions)

    matched = _evaluate_conditions(conditions, payload)
    action_results: list[WorkflowActionResult] = []
    overall_status: WorkflowExecutionStatus = "success" if matched else "skipped"
    error_message: str | None = None

    if matched:
        any_success = False
        any_fail = False

        for action in actions:
            try:
                result = await _execute_action(
                    db=db, action=action, rule=rule, org_uuid=org_uuid, payload=payload
                )
                action_results.append(result)
                if result.status == "success":
                    any_success = True
                if result.status == "failed":
                    any_fail = True
            except Exception as exc:
                any_fail = True
                action_results.append(
                    WorkflowActionResult(
                        action_type=action.type,
                        status="failed",
                        detail=str(exc),
                    )
                )

        if any_fail and any_success:
            overall_status = "partial"
        elif any_fail:
            overall_status = "failed"
            error_message = "部分动作执行失败"
        else:
            overall_status = "success"

    # 写 execution log (失败不破坏主流程)
    try:
        log = WorkflowExecution(
            org_id=org_uuid,
            rule_id=rule.id,
            trigger_event=event,
            event_payload=payload.model_dump(by_alias=True, exclude_none=False),
            conditions_matched=matched,
            actions_result=[r.model_dump(by_alias=True) for r in action_results],
            status=overall_status,
            error_message=error_message,
        )
        db.add(log)
        await db.flush()
    except Exception:
        logger.exception("[rule-engine] failed to write execution log")


# ─── 条件评估 (service.ts:181-237) ──────────────────────────


def _parse_conditions(raw: Any) -> list[WorkflowCondition]:
    """解析 JSONB 列 → list[WorkflowCondition]. 容错: 单个解析失败 skip 该条件."""
    if not isinstance(raw, list):
        return []
    out: list[WorkflowCondition] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(WorkflowCondition.model_validate(item))
        except Exception:
            logger.debug("[rule-engine] skip invalid condition: %r", item)
    return out


def _parse_actions(raw: Any) -> list[WorkflowAction]:
    """解析 JSONB 列 → list[WorkflowAction]. 容错: 单个解析失败 skip 该 action."""
    if not isinstance(raw, list):
        return []
    out: list[WorkflowAction] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(WorkflowAction.model_validate(item))
        except Exception:
            logger.debug("[rule-engine] skip invalid action: %r", item)
    return out


def _evaluate_conditions(conditions: list[WorkflowCondition], payload: TriggerPayload) -> bool:
    """conditions 是 AND-joined; 空 list 视为永远匹配 (与 Node MVP 一致)."""
    if not conditions:
        return True
    return all(_evaluate_one(c, payload) for c in conditions)


def _evaluate_one(c: WorkflowCondition, payload: TriggerPayload) -> bool:
    """单条 condition 评估 — 镜像 Node service.ts:187-207."""
    actual = _get_field_value(c.field, payload)
    if actual is None:
        return False

    # 数值 coerce: UI 端某些 value 走字符串
    actual_num = _try_to_float(actual)
    value_num = _try_to_float(c.value)

    op: WorkflowConditionOperator = c.operator

    if op == "eq":
        return actual == c.value or (
            actual_num is not None and value_num is not None and actual_num == value_num
        )
    if op == "neq":
        return actual != c.value and not (
            actual_num is not None and value_num is not None and actual_num == value_num
        )
    if op == "in":
        return isinstance(c.value, list) and actual in c.value
    if op == "not_in":
        return isinstance(c.value, list) and actual not in c.value
    if op == "gte":
        return actual_num is not None and value_num is not None and actual_num >= value_num
    if op == "lte":
        return actual_num is not None and value_num is not None and actual_num <= value_num
    if op == "gt":
        return actual_num is not None and value_num is not None and actual_num > value_num
    if op == "lt":
        return actual_num is not None and value_num is not None and actual_num < value_num
    return False


def _get_field_value(field: str, payload: TriggerPayload) -> Any:
    """字段路径 → payload 取值. 静态字段 + dynamic prefix (dimension_score: / item_value:).

    镜像 Node service.ts:215-237.
    """
    if field == "risk_level":
        return payload.risk_level
    if field == "assessment_id":
        return payload.assessment_id
    if field == "org_type":
        return payload.org_type
    if field == "total_score":
        return payload.total_score

    if field.startswith("dimension_score:"):
        dim_id = field[len("dimension_score:") :]
        if payload.dimension_scores is not None:
            return payload.dimension_scores.get(dim_id)
        return None
    if field.startswith("item_value:"):
        item_id = field[len("item_value:") :]
        if payload.item_values is not None:
            return payload.item_values.get(item_id)
        return None

    return None


def _try_to_float(value: Any) -> float | None:
    """尝试 coerce 为 float, 不行返 None. 用于数值条件 eq/gte/lte/etc 比较."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bool 是 int 子类, 排除掉避免 True == 1 误判
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


# ─── Action 执行 (service.ts:240-452) ──────────────────────────


async def _execute_action(
    *,
    db: AsyncSession,
    action: WorkflowAction,
    rule: WorkflowRule,
    org_uuid: uuid.UUID,
    payload: TriggerPayload,
) -> WorkflowActionResult:
    """根据 action.type dispatch 到具体 executor."""
    if action.type == "assign_course":
        return await _assign_course_action(db=db, action=action, org_uuid=org_uuid, payload=payload)
    if action.type == "create_episode_candidate":
        return await _create_candidate(
            db=db,
            kind="episode_candidate",
            default_priority="normal",
            action=action,
            rule=rule,
            org_uuid=org_uuid,
            payload=payload,
        )
    if action.type == "create_group_candidate":
        return await _create_candidate(
            db=db,
            kind="group_candidate",
            default_priority="normal",
            action=action,
            rule=rule,
            org_uuid=org_uuid,
            payload=payload,
        )
    if action.type == "create_course_candidate":
        return await _create_candidate(
            db=db,
            kind="course_candidate",
            default_priority="normal",
            action=action,
            rule=rule,
            org_uuid=org_uuid,
            payload=payload,
        )
    if action.type == "create_crisis_candidate":
        return await _create_candidate(
            db=db,
            kind="crisis_candidate",
            default_priority="urgent",
            action=action,
            rule=rule,
            org_uuid=org_uuid,
            payload=payload,
        )
    if action.type == "notify_internal":
        return await _notify_internal_action(
            db=db, action=action, rule=rule, org_uuid=org_uuid, payload=payload
        )
    return WorkflowActionResult(
        action_type=action.type, status="failed", detail="Unknown action type"
    )


async def _assign_course_action(
    *,
    db: AsyncSession,
    action: WorkflowAction,
    org_uuid: uuid.UUID,
    payload: TriggerPayload,
) -> WorkflowActionResult:
    """``assign_course`` — 自动给客户报名某课程 (唯一自动执行的对外动作).

    镜像 Node service.ts:267-316. 设计安全: 课程报名非强制, 客户仍可不参加.
    """
    _ = org_uuid  # course_enrollments 没有 org_id, 通过 instance/course 串
    cfg = action.config or {}
    course_instance_id = cfg.get("courseInstanceId")
    if not course_instance_id or not isinstance(course_instance_id, str):
        return WorkflowActionResult(
            action_type="assign_course",
            status="failed",
            detail="courseInstanceId is required in action config",
        )
    if not payload.user_id:
        return WorkflowActionResult(
            action_type="assign_course",
            status="skipped",
            detail="触发事件没有 userId(匿名测评?)",
        )

    try:
        ci_uuid = uuid.UUID(course_instance_id)
        user_uuid = uuid.UUID(payload.user_id)
    except (ValueError, TypeError):
        return WorkflowActionResult(
            action_type="assign_course",
            status="failed",
            detail="courseInstanceId or userId invalid",
        )

    # 找 course instance 拿 course_id
    ci_q = (
        select(CourseInstance.id, CourseInstance.course_id)
        .where(CourseInstance.id == ci_uuid)
        .limit(1)
    )
    ci_row = (await db.execute(ci_q)).first()
    if ci_row is None:
        return WorkflowActionResult(
            action_type="assign_course", status="failed", detail="course instance not found"
        )
    course_id = ci_row[1]

    # 检查是否已报名 (避免唯一索引冲突)
    existing_q = (
        select(CourseEnrollment.id)
        .where(
            and_(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.user_id == user_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).first()
    if existing is not None:
        return WorkflowActionResult(
            action_type="assign_course",
            status="skipped",
            detail="该来访者已注册此课程",
            ref_id=str(existing[0]),
        )

    enrollment = CourseEnrollment(
        course_id=course_id,
        instance_id=ci_uuid,
        user_id=user_uuid,
        enrollment_source="auto_rule",
        approval_status="auto_approved",
    )
    db.add(enrollment)
    await db.flush()

    return WorkflowActionResult(
        action_type="assign_course", status="success", ref_id=str(enrollment.id)
    )


async def _create_candidate(
    *,
    db: AsyncSession,
    kind: CandidateKind,
    default_priority: CandidatePriority,
    action: WorkflowAction,
    rule: WorkflowRule,
    org_uuid: uuid.UUID,
    payload: TriggerPayload,
) -> WorkflowActionResult:
    """写 ``candidate_pool`` pending 候选 + (可选) 通知 assignee.

    镜像 Node service.ts:322-391.
    """
    action_type: WorkflowActionType = _kind_to_action_type(kind)

    if not payload.user_id:
        return WorkflowActionResult(
            action_type=action_type, status="skipped", detail="触发事件没有 userId(匿名测评?)"
        )

    cfg = action.config or {}
    suggestion = cfg.get("suggestion") if isinstance(cfg.get("suggestion"), str) else None
    suggestion = suggestion or rule.name
    reason = cfg.get("reason") if isinstance(cfg.get("reason"), str) else None
    reason = reason or f"由规则「{rule.name}」触发 · 风险等级 {payload.risk_level}"
    assigned_to_user_id_raw = cfg.get("assignedToUserId")
    assigned_to_user_id = (
        assigned_to_user_id_raw if isinstance(assigned_to_user_id_raw, str) else None
    )

    # target_group_instance_id / target_course_instance_id — 仅相应 kind 有意义
    target_group_instance_id: uuid.UUID | None = None
    target_course_instance_id: uuid.UUID | None = None
    if kind == "group_candidate":
        target_group_instance_id = _try_uuid(cfg.get("targetGroupInstanceId"))
    elif kind == "course_candidate":
        target_course_instance_id = _try_uuid(cfg.get("targetCourseInstanceId"))

    cfg_priority_raw = cfg.get("priority")
    cfg_priority: CandidatePriority = (
        cast("CandidatePriority", cfg_priority_raw)
        if isinstance(cfg_priority_raw, str)
        and cfg_priority_raw in ("low", "normal", "high", "urgent")
        else default_priority
    )

    try:
        client_uuid = uuid.UUID(payload.user_id)
    except (ValueError, TypeError):
        return WorkflowActionResult(
            action_type=action_type, status="failed", detail="payload.userId invalid"
        )
    result_uuid = _try_uuid(payload.result_id)
    assigned_uuid = _try_uuid(assigned_to_user_id)

    entry = CandidatePool(
        org_id=org_uuid,
        client_user_id=client_uuid,
        kind=kind,
        suggestion=suggestion,
        reason=reason,
        priority=cfg_priority,
        source_rule_id=rule.id,
        source_result_id=result_uuid,
        source_payload=payload.model_dump(by_alias=True, exclude_none=False),
        status="pending",
        assigned_to_user_id=assigned_uuid,
        target_group_instance_id=target_group_instance_id,
        target_course_instance_id=target_course_instance_id,
    )
    db.add(entry)
    await db.flush()

    # 通知 assignee (失败 swallow)
    if assigned_uuid is not None:
        try:
            db.add(
                Notification(
                    org_id=org_uuid,
                    user_id=assigned_uuid,
                    type="candidate_pending",
                    title=f"新的{suggestion}",
                    body=reason,
                    ref_type="candidate_pool",
                    ref_id=entry.id,
                )
            )
            await db.flush()
        except Exception:
            logger.exception("[rule-engine] notify assignee failed (non-blocking)")

    return WorkflowActionResult(action_type=action_type, status="success", ref_id=str(entry.id))


def _kind_to_action_type(kind: CandidateKind) -> WorkflowActionType:
    """``episode_candidate`` → ``create_episode_candidate``, etc."""
    return f"create_{kind.replace('_candidate', '')}_candidate"  # type: ignore[return-value]


async def _notify_internal_action(
    *,
    db: AsyncSession,
    action: WorkflowAction,
    rule: WorkflowRule,
    org_uuid: uuid.UUID,
    payload: TriggerPayload,
) -> WorkflowActionResult:
    """``notify_internal`` — 给 specific user 或 role 全员发通知.

    镜像 Node service.ts:393-452. N+1 防范: 按 role 通知时**单次** SELECT 拿 user_ids,
    然后循环 ``db.add(Notification)`` 是 in-memory 操作, 不是 round-trip.
    """
    cfg = action.config or {}
    target_role = cfg.get("role") if isinstance(cfg.get("role"), str) else None
    target_user_id_raw = cfg.get("userId")
    target_user_id = target_user_id_raw if isinstance(target_user_id_raw, str) else None
    title = cfg.get("title") if isinstance(cfg.get("title"), str) else None
    title = title or f"规则触发:{rule.name}"
    body = cfg.get("body") if isinstance(cfg.get("body"), str) else None
    body = body or f"风险等级 {payload.risk_level}"

    try:
        if target_user_id is not None:
            target_uuid = _try_uuid(target_user_id)
            if target_uuid is None:
                return WorkflowActionResult(
                    action_type="notify_internal", status="failed", detail="userId invalid"
                )
            db.add(
                Notification(
                    org_id=org_uuid,
                    user_id=target_uuid,
                    type="rule_triggered",
                    title=title,
                    body=body,
                    ref_type="workflow_rule",
                    ref_id=rule.id,
                )
            )
            await db.flush()
            return WorkflowActionResult(
                action_type="notify_internal",
                status="success",
                detail=f"Notified user {target_user_id}",
            )

        if target_role is not None:
            # 单查询拿 role 全员 (N+1 防范), 然后批量 add
            members_q = select(OrgMember.user_id).where(
                and_(
                    OrgMember.org_id == org_uuid,
                    OrgMember.role == target_role,
                    OrgMember.status == "active",
                )
            )
            user_ids = [row[0] for row in (await db.execute(members_q)).all()]
            for uid in user_ids:
                db.add(
                    Notification(
                        org_id=org_uuid,
                        user_id=uid,
                        type="rule_triggered",
                        title=title,
                        body=body,
                        ref_type="workflow_rule",
                        ref_id=rule.id,
                    )
                )
            await db.flush()
            return WorkflowActionResult(
                action_type="notify_internal",
                status="success",
                detail=f"Notified {len(user_ids)} {target_role}(s)",
            )

        return WorkflowActionResult(
            action_type="notify_internal",
            status="failed",
            detail="role or userId required in config",
        )
    except Exception as exc:
        return WorkflowActionResult(
            action_type="notify_internal",
            status="failed",
            detail=str(exc),
        )


def _try_uuid(value: Any) -> uuid.UUID | None:
    """Best-effort str → UUID. 失败返 None (用于可空 ref 字段)."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return None


__all__ = ["TriggerPayload", "run_rules_for_event"]
