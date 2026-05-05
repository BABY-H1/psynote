"""
Workflow router — 镜像 ``server/src/modules/workflow/workflow.routes.ts`` (436 行).

挂在 ``/api/orgs/{org_id}/workflow`` prefix.

Endpoints:

  Rules:
    GET    /rules                                  — 列表 (按 priority desc, createdAt desc)
    GET    /rules/{rule_id}                        — 单条详情
    POST   /rules                                  — 创建 (org_admin only)
    PATCH  /rules/{rule_id}                        — 更新 (org_admin only)
    DELETE /rules/{rule_id}                        — 删除 (org_admin only)
    PUT    /rules/by-assessment/{assessment_id}    — 批量同步 (admin/counselor; 走测评向导)
    GET    /rules/by-assessment/{assessment_id}    — 列表某 assessment 的所有规则

  Executions:
    GET    /executions?ruleId=&limit=              — 执行日志 (默认 50 行, 上限 200)

  Candidates:
    GET    /candidates?status=&kind=               — 列表 (默认 status=pending, IN 多值)
    POST   /candidates/{id}/accept                 — 接受候选 (admin/counselor)
                                                     特殊: crisis_candidate → 原子建 episode + crisis_case
                                                            episode_candidate + resolvedRefType=care_episode → 原子建 episode
    POST   /candidates/{id}/dismiss                — 忽略候选 (admin/counselor)

RBAC 守门:
  - 所有端点 require OrgContext.
  - rule mutation (POST/PATCH/DELETE) require ``org_admin``.
  - candidate accept/dismiss + rule sync require ``org_admin`` 或 ``counselor``.

N+1 防范:
  - ``GET /candidates`` 走单查询 INNER JOIN users (1 round-trip) 拿 client_name/email.
  - ``GET /executions`` 单查询带 LIMIT, 没有 enrich loop.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.workflow.schemas import (
    CandidateAcceptRequest,
    CandidateAcceptResponse,
    CandidateDismissRequest,
    CandidateRow,
    OkResponse,
    WorkflowExecutionRow,
    WorkflowRuleCreateRequest,
    WorkflowRuleRow,
    WorkflowRuleSyncRequest,
    WorkflowRuleSyncResponse,
    WorkflowRuleUpdateRequest,
)
from app.core.database import get_db
from app.db.models.candidate_pool import CandidatePool
from app.db.models.care_episodes import CareEpisode
from app.db.models.crisis_cases import CrisisCase
from app.db.models.users import User
from app.db.models.workflow_executions import WorkflowExecution
from app.db.models.workflow_rules import WorkflowRule
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _require_org_admin(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return org


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _rule_to_row(r: WorkflowRule) -> WorkflowRuleRow:
    return WorkflowRuleRow(
        id=str(r.id),
        org_id=str(r.org_id),
        scope_assessment_id=str(r.scope_assessment_id) if r.scope_assessment_id else None,
        name=r.name,
        description=r.description,
        trigger_event=r.trigger_event,
        conditions=r.conditions or [],
        actions=r.actions or [],
        is_active=bool(r.is_active),
        priority=int(r.priority or 0),
        source=r.source if r.source in ("manual", "assessment_wizard") else "manual",
        created_by=str(r.created_by) if r.created_by else None,
        created_at=getattr(r, "created_at", None),
        updated_at=getattr(r, "updated_at", None),
    )


def _execution_to_row(e: WorkflowExecution) -> WorkflowExecutionRow:
    return WorkflowExecutionRow(
        id=str(e.id),
        org_id=str(e.org_id),
        rule_id=str(e.rule_id) if e.rule_id else None,
        trigger_event=e.trigger_event,
        event_payload=dict(e.event_payload or {}),
        conditions_matched=bool(e.conditions_matched),
        actions_result=list(e.actions_result or []),
        status=e.status,
        error_message=e.error_message,
        created_at=getattr(e, "created_at", None),
    )


# ─── Rules: GET /rules ────────────────────────────────────────


@router.get("/rules", response_model=list[WorkflowRuleRow])
async def list_rules(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[WorkflowRuleRow]:
    """``GET /rules`` — 列表. 镜像 routes.ts:48-56."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    q = (
        select(WorkflowRule)
        .where(WorkflowRule.org_id == org_uuid)
        .order_by(desc(WorkflowRule.priority), desc(WorkflowRule.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_rule_to_row(r) for r in rows]


@router.get("/rules/{rule_id}", response_model=WorkflowRuleRow)
async def get_rule(
    org_id: str,
    rule_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowRuleRow:
    """``GET /rules/{rule_id}``. 镜像 routes.ts:58-68."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    r_uuid = parse_uuid_or_raise(rule_id, field="ruleId")

    q = (
        select(WorkflowRule)
        .where(and_(WorkflowRule.id == r_uuid, WorkflowRule.org_id == org_uuid))
        .limit(1)
    )
    rule = (await db.execute(q)).scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Workflow rule", rule_id)
    return _rule_to_row(rule)


@router.post("/rules", response_model=WorkflowRuleRow, status_code=status.HTTP_201_CREATED)
async def create_rule(
    org_id: str,
    body: WorkflowRuleCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowRuleRow:
    """``POST /rules`` (org_admin only). 镜像 routes.ts:70-111."""
    _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    if not body.name.strip():
        raise ValidationError("规则名称必填")
    # Phase 12 MVP: 只支持 assessment_result.created
    if body.trigger_event != "assessment_result.created":
        raise ValidationError("当前仅支持 assessment_result.created 触发器")

    scope_uuid: uuid.UUID | None = None
    if body.scope_assessment_id:
        scope_uuid = parse_uuid_or_raise(body.scope_assessment_id, field="scopeAssessmentId")

    rule = WorkflowRule(
        org_id=org_uuid,
        scope_assessment_id=scope_uuid,
        name=body.name.strip(),
        description=body.description or None,
        trigger_event=body.trigger_event,
        conditions=[c.model_dump(by_alias=True) for c in body.conditions],
        actions=[a.model_dump(by_alias=True) for a in body.actions],
        is_active=body.is_active,
        priority=body.priority,
        source=body.source,
        created_by=user_uuid,
    )
    db.add(rule)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="workflow.rule.created",
        resource="workflow_rules",
        resource_id=str(rule.id),
    )
    return _rule_to_row(rule)


@router.put("/rules/by-assessment/{assessment_id}", response_model=WorkflowRuleSyncResponse)
async def sync_rules_by_assessment(
    org_id: str,
    assessment_id: str,
    body: WorkflowRuleSyncRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowRuleSyncResponse:
    """``PUT /rules/by-assessment/{assessment_id}`` (admin/counselor). 镜像 routes.ts:123-169.

    替换该 assessment 下所有 ``source='assessment_wizard'`` 规则 (preserves manual rules).
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    a_uuid = parse_uuid_or_raise(assessment_id, field="assessmentId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 1) 先删该 assessment 下的 wizard 规则
    await db.execute(
        delete(WorkflowRule).where(
            and_(
                WorkflowRule.org_id == org_uuid,
                WorkflowRule.scope_assessment_id == a_uuid,
                WorkflowRule.source == "assessment_wizard",
            )
        )
    )

    if not body.rules:
        await db.commit()
        return WorkflowRuleSyncResponse(count=0)

    # 2) 批量插入新 wizard 规则
    new_rules: list[WorkflowRule] = []
    for entry in body.rules:
        new_rules.append(
            WorkflowRule(
                org_id=org_uuid,
                scope_assessment_id=a_uuid,
                name=(entry.name.strip() if entry.name else "(未命名规则)"),
                description=entry.description or None,
                trigger_event="assessment_result.created",
                conditions=[c.model_dump(by_alias=True) for c in entry.conditions],
                actions=[a.model_dump(by_alias=True) for a in entry.actions],
                is_active=entry.is_active,
                priority=entry.priority,
                source="assessment_wizard",
                created_by=user_uuid,
            )
        )
    db.add_all(new_rules)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="workflow.rules.synced",
        resource="workflow_rules",
        resource_id=assessment_id,
    )
    return WorkflowRuleSyncResponse(count=len(new_rules))


@router.get("/rules/by-assessment/{assessment_id}", response_model=list[WorkflowRuleRow])
async def list_rules_by_assessment(
    org_id: str,
    assessment_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[WorkflowRuleRow]:
    """``GET /rules/by-assessment/{assessment_id}``. 镜像 routes.ts:172-184."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    a_uuid = parse_uuid_or_raise(assessment_id, field="assessmentId")

    q = (
        select(WorkflowRule)
        .where(
            and_(
                WorkflowRule.org_id == org_uuid,
                WorkflowRule.scope_assessment_id == a_uuid,
            )
        )
        .order_by(desc(WorkflowRule.priority), desc(WorkflowRule.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_rule_to_row(r) for r in rows]


@router.patch("/rules/{rule_id}", response_model=WorkflowRuleRow)
async def update_rule(
    org_id: str,
    rule_id: str,
    body: WorkflowRuleUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowRuleRow:
    """``PATCH /rules/{rule_id}`` (org_admin only). 镜像 routes.ts:186-217."""
    _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    r_uuid = parse_uuid_or_raise(rule_id, field="ruleId")

    q = (
        select(WorkflowRule)
        .where(and_(WorkflowRule.id == r_uuid, WorkflowRule.org_id == org_uuid))
        .limit(1)
    )
    rule = (await db.execute(q)).scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Workflow rule", rule_id)

    if body.name is not None:
        rule.name = body.name.strip()
    if body.description is not None:
        rule.description = body.description
    if body.conditions is not None:
        rule.conditions = [c.model_dump(by_alias=True) for c in body.conditions]
    if body.actions is not None:
        rule.actions = [a.model_dump(by_alias=True) for a in body.actions]
    if body.is_active is not None:
        rule.is_active = body.is_active
    if body.priority is not None:
        rule.priority = body.priority
    rule.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="workflow.rule.updated",
        resource="workflow_rules",
        resource_id=rule_id,
    )
    return _rule_to_row(rule)


@router.delete("/rules/{rule_id}", response_model=OkResponse)
async def delete_rule(
    org_id: str,
    rule_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """``DELETE /rules/{rule_id}`` (org_admin only). 镜像 routes.ts:219-232."""
    _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    r_uuid = parse_uuid_or_raise(rule_id, field="ruleId")

    q = (
        select(WorkflowRule)
        .where(and_(WorkflowRule.id == r_uuid, WorkflowRule.org_id == org_uuid))
        .limit(1)
    )
    rule = (await db.execute(q)).scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Workflow rule", rule_id)

    await db.execute(delete(WorkflowRule).where(WorkflowRule.id == r_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="workflow.rule.deleted",
        resource="workflow_rules",
        resource_id=rule_id,
    )
    return OkResponse()


# ─── Executions: GET /executions ─────────────────────────────


@router.get("/executions", response_model=list[WorkflowExecutionRow])
async def list_executions(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    rule_id: Annotated[str | None, Query(alias="ruleId")] = None,
    limit: Annotated[str | None, Query()] = None,
) -> list[WorkflowExecutionRow]:
    """``GET /executions?ruleId=&limit=``. 镜像 routes.ts:236-251.

    上限 200 (与 Node 一致), 默认 50.
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    try:
        max_rows = int(limit) if limit else 50
    except ValueError:
        max_rows = 50
    max_rows = max(1, min(max_rows, 200))

    conditions: list[Any] = [WorkflowExecution.org_id == org_uuid]
    if rule_id:
        r_uuid = parse_uuid_or_raise(rule_id, field="ruleId")
        conditions.append(WorkflowExecution.rule_id == r_uuid)

    q = (
        select(WorkflowExecution)
        .where(and_(*conditions))
        .order_by(desc(WorkflowExecution.created_at))
        .limit(max_rows)
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_execution_to_row(r) for r in rows]


# ─── Candidate Pool: GET /candidates ──────────────────────────


@router.get("/candidates", response_model=list[CandidateRow])
async def list_candidates(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    kind_filter: Annotated[str | None, Query(alias="kind")] = None,
) -> list[CandidateRow]:
    """``GET /candidates?status=&kind=``. 镜像 routes.ts:255-301.

    N+1 防范: 单次 INNER JOIN users (1 round-trip). 不是 list+enrich pattern.
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conditions: list[Any] = [CandidatePool.org_id == org_uuid]
    if status_filter:
        statuses = [s for s in status_filter.split(",") if s]
        if statuses:
            conditions.append(CandidatePool.status.in_(statuses))
    else:
        # Default: only pending
        conditions.append(CandidatePool.status == "pending")
    if kind_filter:
        kinds = [k for k in kind_filter.split(",") if k]
        if kinds:
            conditions.append(CandidatePool.kind.in_(kinds))

    q = (
        select(
            CandidatePool.id,
            CandidatePool.org_id,
            CandidatePool.client_user_id,
            User.name,
            User.email,
            CandidatePool.kind,
            CandidatePool.suggestion,
            CandidatePool.reason,
            CandidatePool.priority,
            CandidatePool.source_rule_id,
            CandidatePool.source_result_id,
            CandidatePool.source_payload,
            CandidatePool.status,
            CandidatePool.assigned_to_user_id,
            CandidatePool.handled_by_user_id,
            CandidatePool.handled_at,
            CandidatePool.handled_note,
            CandidatePool.resolved_ref_type,
            CandidatePool.resolved_ref_id,
            CandidatePool.created_at,
        )
        .join(User, User.id == CandidatePool.client_user_id)
        .where(and_(*conditions))
        .order_by(desc(CandidatePool.priority), desc(CandidatePool.created_at))
        .limit(200)
    )
    rows = (await db.execute(q)).all()
    return [
        CandidateRow(
            id=str(r[0]),
            org_id=str(r[1]),
            client_user_id=str(r[2]),
            client_name=r[3],
            client_email=r[4],
            kind=r[5],
            suggestion=r[6],
            reason=r[7],
            priority=r[8],
            source_rule_id=str(r[9]) if r[9] else None,
            source_result_id=str(r[10]) if r[10] else None,
            source_payload=r[11] if r[11] else None,
            status=r[12],
            assigned_to_user_id=str(r[13]) if r[13] else None,
            handled_by_user_id=str(r[14]) if r[14] else None,
            handled_at=r[15],
            handled_note=r[16],
            resolved_ref_type=r[17],
            resolved_ref_id=str(r[18]) if r[18] else None,
            created_at=r[19],
        )
        for r in rows
    ]


# ─── POST /candidates/{id}/accept ────────────────────────────


@router.post("/candidates/{candidate_id}/accept", response_model=CandidateAcceptResponse)
async def accept_candidate(
    org_id: str,
    candidate_id: str,
    body: CandidateAcceptRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateAcceptResponse:
    """``POST /candidates/{id}/accept`` (admin/counselor). 镜像 routes.ts:303-412.

    特殊路径:
      - ``crisis_candidate``: 原子建 careEpisode + crisis_case → resolved_ref_type='crisis_case'.
      - ``episode_candidate`` 且 body.resolved_ref_type='care_episode': 原子建 careEpisode.
      - 其他 (group/course): 仅翻 status (具体处置在 workbench 选).
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    c_uuid = parse_uuid_or_raise(candidate_id, field="candidateId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(CandidatePool)
        .where(and_(CandidatePool.id == c_uuid, CandidatePool.org_id == org_uuid))
        .limit(1)
    )
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing is None:
        raise NotFoundError("Candidate entry", candidate_id)
    if existing.status != "pending":
        raise ValidationError(f"候选已被处理(status={existing.status})")

    now = datetime.now(UTC)

    # 路径 1: crisis_candidate → 原子建 episode + crisis_case
    if existing.kind == "crisis_candidate":
        episode = CareEpisode(
            org_id=org_uuid,
            client_id=existing.client_user_id,
            counselor_id=user_uuid,
            chief_complaint=existing.suggestion or "危机研判分流",
            current_risk="level_4",
            intervention_type="crisis",
        )
        db.add(episode)
        await db.flush()

        crisis = CrisisCase(
            org_id=org_uuid,
            episode_id=episode.id,
            candidate_id=c_uuid,
            stage="open",
            checklist={},
            created_by=user_uuid,
        )
        db.add(crisis)
        await db.flush()

        existing.status = "accepted"
        existing.handled_by_user_id = user_uuid
        existing.handled_at = now
        existing.handled_note = body.note or None
        existing.resolved_ref_type = "crisis_case"
        existing.resolved_ref_id = crisis.id
        await db.commit()

        await record_audit(
            db=db,
            org_id=org_id,
            user_id=user.id,
            action="candidate.accepted.crisis",
            resource="candidate_pool",
            resource_id=candidate_id,
        )
        return _candidate_accept_response(
            existing, episode_id=str(episode.id), crisis_case_id=str(crisis.id)
        )

    # 路径 2: episode_candidate + resolved_ref_type='care_episode' → 原子建 episode
    if existing.kind == "episode_candidate" and body.resolved_ref_type == "care_episode":
        episode = CareEpisode(
            org_id=org_uuid,
            client_id=existing.client_user_id,
            counselor_id=user_uuid,
            chief_complaint=existing.suggestion or "研判分流转入",
            current_risk="level_1",
        )
        db.add(episode)
        await db.flush()

        existing.status = "accepted"
        existing.handled_by_user_id = user_uuid
        existing.handled_at = now
        existing.handled_note = body.note or None
        existing.resolved_ref_type = "care_episode"
        existing.resolved_ref_id = episode.id
        await db.commit()

        await record_audit(
            db=db,
            org_id=org_id,
            user_id=user.id,
            action="candidate.accepted",
            resource="candidate_pool",
            resource_id=candidate_id,
        )
        return _candidate_accept_response(existing, episode_id=str(episode.id))

    # 默认路径 (group/course/etc): 仅翻 status
    existing.status = "accepted"
    existing.handled_by_user_id = user_uuid
    existing.handled_at = now
    existing.handled_note = body.note or None
    existing.resolved_ref_type = body.resolved_ref_type or None
    existing.resolved_ref_id = (
        parse_uuid_or_raise(body.resolved_ref_id, field="resolvedRefId")
        if body.resolved_ref_id
        else None
    )
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="candidate.accepted",
        resource="candidate_pool",
        resource_id=candidate_id,
    )
    return _candidate_accept_response(existing)


def _candidate_accept_response(
    c: CandidatePool,
    *,
    episode_id: str | None = None,
    crisis_case_id: str | None = None,
) -> CandidateAcceptResponse:
    """ORM → CandidateAcceptResponse (含可选 episode_id / crisis_case_id)."""
    return CandidateAcceptResponse(
        id=str(c.id),
        org_id=str(c.org_id),
        client_user_id=str(c.client_user_id),
        client_name=None,  # accept 路径没 join user, 留空
        client_email=None,
        kind=c.kind,
        suggestion=c.suggestion,
        reason=c.reason,
        priority=c.priority,
        source_rule_id=str(c.source_rule_id) if c.source_rule_id else None,
        source_result_id=str(c.source_result_id) if c.source_result_id else None,
        source_payload=dict(c.source_payload) if c.source_payload else None,
        status=c.status,
        assigned_to_user_id=str(c.assigned_to_user_id) if c.assigned_to_user_id else None,
        handled_by_user_id=str(c.handled_by_user_id) if c.handled_by_user_id else None,
        handled_at=c.handled_at,
        handled_note=c.handled_note,
        resolved_ref_type=c.resolved_ref_type,
        resolved_ref_id=str(c.resolved_ref_id) if c.resolved_ref_id else None,
        created_at=getattr(c, "created_at", None),
        episode_id=episode_id,
        crisis_case_id=crisis_case_id,
    )


# ─── POST /candidates/{id}/dismiss ───────────────────────────


@router.post("/candidates/{candidate_id}/dismiss", response_model=CandidateRow)
async def dismiss_candidate(
    org_id: str,
    candidate_id: str,
    body: CandidateDismissRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateRow:
    """``POST /candidates/{id}/dismiss`` (admin/counselor). 镜像 routes.ts:414-435."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    c_uuid = parse_uuid_or_raise(candidate_id, field="candidateId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    q = (
        select(CandidatePool)
        .where(and_(CandidatePool.id == c_uuid, CandidatePool.org_id == org_uuid))
        .limit(1)
    )
    candidate = (await db.execute(q)).scalar_one_or_none()
    if candidate is None:
        raise NotFoundError("Candidate entry", candidate_id)

    candidate.status = "dismissed"
    candidate.handled_by_user_id = user_uuid
    candidate.handled_at = datetime.now(UTC)
    candidate.handled_note = body.reason or None
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="candidate.dismissed",
        resource="candidate_pool",
        resource_id=candidate_id,
    )
    return CandidateRow(
        id=str(candidate.id),
        org_id=str(candidate.org_id),
        client_user_id=str(candidate.client_user_id),
        client_name=None,
        client_email=None,
        kind=candidate.kind,
        suggestion=candidate.suggestion,
        reason=candidate.reason,
        priority=candidate.priority,
        source_rule_id=str(candidate.source_rule_id) if candidate.source_rule_id else None,
        source_result_id=str(candidate.source_result_id) if candidate.source_result_id else None,
        source_payload=dict(candidate.source_payload) if candidate.source_payload else None,
        status=candidate.status,
        assigned_to_user_id=str(candidate.assigned_to_user_id)
        if candidate.assigned_to_user_id
        else None,
        handled_by_user_id=str(candidate.handled_by_user_id)
        if candidate.handled_by_user_id
        else None,
        handled_at=candidate.handled_at,
        handled_note=candidate.handled_note,
        resolved_ref_type=candidate.resolved_ref_type,
        resolved_ref_id=str(candidate.resolved_ref_id) if candidate.resolved_ref_id else None,
        created_at=getattr(candidate, "created_at", None),
    )


# ─── 让 lint 不警告 unused imports (Response 备用) ─────────────
_ = (Response,)


__all__ = ["router"]
