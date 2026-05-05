"""
Triage 查询服务 — 镜像 ``server/src/modules/triage/triage-queries.service.ts`` (509 行).

研判分流 ("研判分流") workspace 的查询底层. 与 crisis dashboard 区别: crisis 只看
L4 案件, 这里看全部 L1-L4 + unrated, 让 counselor / admin 决定下一步动作.

主要函数:
  - ``list_triage_candidates(org_id, opts)``: master list (mode='screening' / 'manual' / 'all')
  - ``list_triage_buckets(org_id, opts)``: L1-L4 + unrated count 聚合
  - ``list_candidates_for_service(...)``: 反查 group/course instance 的候选 tab
  - ``update_result_risk_level(...)``: admin 手工调整 AI 等级
  - ``lazy_create_candidate(...)``: Phase H BUG-007 修复 — result→candidate 懒创建

数据源 (按 mode 不同):
  - mode='screening' (默认):
      assessment_results JOIN assessments WHERE assessments.assessment_type='screening'
  - mode='manual':
      candidate_pool 中 sourceRuleId IS NULL 的行 (今天还没人写, 但端点保留)
  - mode='all': 联合两者按 createdAt desc 排序

N+1 防范 (任务规则约束):
  - 主查询走 single SQL JOIN (assessment_results × assessments × users × candidate_pool),
    NOT list+enrich pattern. 用 LEFT JOIN candidate_pool 让规则引擎已产生 candidate 的
    行直接带出 candidateId / candidateStatus / candidateKind / suggestion 等列.
  - data_scope='assigned' 用 IN 子句 (单查询), 不在 Python 端循环 sub-query.
  - bucket 计数走单查询 GROUP BY riskLevel (Postgres 聚合, 不在 Python 端 collect).

跨 org 防御:
  - 所有 lookup (lazyCreateCandidate / updateResultRiskLevel) 同时 ``WHERE org_id=...``,
    跨 org 的 result 当作不存在 (NotFoundError, 不泄漏存在性, 与 admin tenant get/patch
    的 404 模式一致).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.triage.schemas import (
    CandidateKind,
    CandidatePoolRow,
    CandidatePriority,
    ServiceCandidateRow,
    TriageBuckets,
    TriageCandidateRow,
    TriageMode,
)
from app.db.models.assessment_results import AssessmentResult
from app.db.models.assessments import Assessment
from app.db.models.candidate_pool import CandidatePool
from app.db.models.users import User
from app.lib.errors import NotFoundError
from app.middleware.data_scope import DataScope

logger = logging.getLogger(__name__)


# ─── list_triage_candidates ─────────────────────────────────────


async def list_triage_candidates(
    *,
    db: AsyncSession,
    org_id: str,
    mode: TriageMode = "screening",
    batch_id: str | None = None,
    assessment_id: str | None = None,
    level: str | None = None,
    counselor_id: str | None = None,
    scope: DataScope | None = None,
) -> list[TriageCandidateRow]:
    """master list — 按 mode 分支.

    mode='screening': 看筛查类型测评结果 (AI 分级了, 但还没人处理).
    mode='manual':    看手工添加的 candidate_pool (sourceRuleId IS NULL).
    mode='all':       两者联合, createdAt desc.

    数据 row 形态 = de-normalised view model (左侧列表一次性显示需要的全部列;
    详情 panel 再 fetch /results/{id} 拿完整数据).
    """
    _ = counselor_id  # 当前未在底层查询使用 (与 Node 一致 — 留参保持接口签名)

    if mode == "screening":
        return await _query_screening(
            db=db,
            org_id=org_id,
            batch_id=batch_id,
            assessment_id=assessment_id,
            level=level,
            scope=scope,
        )
    if mode == "manual":
        return await _query_manual(db=db, org_id=org_id, level=level, scope=scope)
    # mode='all'
    s_rows = await _query_screening(
        db=db,
        org_id=org_id,
        batch_id=batch_id,
        assessment_id=assessment_id,
        level=level,
        scope=scope,
    )
    m_rows = await _query_manual(db=db, org_id=org_id, level=level, scope=scope)
    combined = [*s_rows, *m_rows]
    # 按 createdAt desc; Python sort 稳定
    combined.sort(key=lambda r: r.created_at, reverse=True)
    return combined


async def _query_screening(
    *,
    db: AsyncSession,
    org_id: str,
    batch_id: str | None,
    assessment_id: str | None,
    level: str | None,
    scope: DataScope | None,
) -> list[TriageCandidateRow]:
    """``mode='screening'`` 分支.

    单 SQL JOIN: assessment_results × assessments (INNER) × users (LEFT — userId 可能 NULL,
    匿名公开测评) × candidate_pool (LEFT — 规则引擎可能没产生 candidate).

    Phase J 改动: 多 select ``resolved_ref_type`` / ``resolved_ref_id``, 让前端 detail
    panel 能 inline 渲染危机清单或跳转关联 episode.
    """
    org_uuid = uuid.UUID(org_id)
    conditions: list[Any] = [
        AssessmentResult.org_id == org_uuid,
        AssessmentResult.deleted_at.is_(None),
        Assessment.assessment_type == "screening",
    ]

    if batch_id:
        conditions.append(AssessmentResult.batch_id == uuid.UUID(batch_id))
    if assessment_id:
        conditions.append(AssessmentResult.assessment_id == uuid.UUID(assessment_id))
    if level:
        conditions.append(AssessmentResult.risk_level == level)

    # data_scope='assigned' 过滤 — 仅显示自己 client + 匿名公开测评
    if scope is not None and scope.type == "assigned":
        if not scope.allowed_client_ids:
            conditions.append(AssessmentResult.user_id.is_(None))
        else:
            allowed = [uuid.UUID(c) for c in scope.allowed_client_ids]
            conditions.append(
                or_(
                    AssessmentResult.user_id.in_(allowed),
                    AssessmentResult.user_id.is_(None),
                )
            )

    q = (
        select(
            AssessmentResult.id.label("result_id"),
            AssessmentResult.user_id,
            User.name.label("user_name"),
            AssessmentResult.assessment_id,
            Assessment.title.label("assessment_title"),
            Assessment.assessment_type,
            AssessmentResult.risk_level,
            AssessmentResult.total_score,
            AssessmentResult.batch_id,
            AssessmentResult.created_at,
            CandidatePool.id.label("candidate_id"),
            CandidatePool.status.label("candidate_status"),
            CandidatePool.kind.label("candidate_kind"),
            CandidatePool.suggestion,
            CandidatePool.priority,
            AssessmentResult.care_episode_id.label("latest_episode_id"),
            CandidatePool.resolved_ref_type,
            CandidatePool.resolved_ref_id,
        )
        .select_from(AssessmentResult)
        .join(Assessment, Assessment.id == AssessmentResult.assessment_id)
        .outerjoin(User, User.id == AssessmentResult.user_id)
        .outerjoin(
            CandidatePool,
            and_(
                CandidatePool.source_result_id == AssessmentResult.id,
                CandidatePool.org_id == org_uuid,
            ),
        )
        .where(and_(*conditions))
        .order_by(desc(AssessmentResult.created_at))
    )
    rows = (await db.execute(q)).all()

    return [
        TriageCandidateRow(
            source="screening",
            result_id=str(r.result_id),
            candidate_id=str(r.candidate_id) if r.candidate_id else None,
            user_id=str(r.user_id) if r.user_id else None,
            user_name=r.user_name,
            assessment_id=str(r.assessment_id) if r.assessment_id else None,
            assessment_title=r.assessment_title,
            assessment_type=r.assessment_type,
            risk_level=r.risk_level,
            total_score=str(r.total_score) if r.total_score is not None else None,
            batch_id=str(r.batch_id) if r.batch_id else None,
            candidate_status=r.candidate_status,
            candidate_kind=r.candidate_kind,
            suggestion=r.suggestion,
            priority=r.priority,
            latest_episode_id=str(r.latest_episode_id) if r.latest_episode_id else None,
            resolved_ref_type=r.resolved_ref_type,
            resolved_ref_id=str(r.resolved_ref_id) if r.resolved_ref_id else None,
            created_at=r.created_at
            if isinstance(r.created_at, datetime)
            else _coerce_dt(r.created_at),
        )
        for r in rows
    ]


async def _query_manual(
    *,
    db: AsyncSession,
    org_id: str,
    level: str | None,
    scope: DataScope | None,
) -> list[TriageCandidateRow]:
    """``mode='manual'`` 分支.

    Manual = candidate_pool 中 sourceRuleId IS NULL. 今天没人写这条路径
    (rule-engine 一定 populate sourceRuleId), 但端点保留, 让未来"手工新增研判
    对象"功能能直接接入而不需要第二个 API.
    """
    org_uuid = uuid.UUID(org_id)
    conditions: list[Any] = [
        CandidatePool.org_id == org_uuid,
        CandidatePool.source_rule_id.is_(None),
    ]

    # manual 行没有 risk_level — level filter 等价于过滤掉所有
    if level:
        return []

    # data_scope='assigned' 过滤
    if scope is not None and scope.type == "assigned":
        if not scope.allowed_client_ids:
            return []
        allowed = [uuid.UUID(c) for c in scope.allowed_client_ids]
        conditions.append(CandidatePool.client_user_id.in_(allowed))

    q = (
        select(
            CandidatePool.id.label("candidate_id"),
            CandidatePool.client_user_id.label("user_id"),
            User.name.label("user_name"),
            CandidatePool.kind,
            CandidatePool.suggestion,
            CandidatePool.priority,
            CandidatePool.status,
            CandidatePool.created_at,
            CandidatePool.resolved_ref_type,
            CandidatePool.resolved_ref_id,
        )
        .select_from(CandidatePool)
        .outerjoin(User, User.id == CandidatePool.client_user_id)
        .where(and_(*conditions))
        .order_by(desc(CandidatePool.created_at))
    )
    rows = (await db.execute(q)).all()

    return [
        TriageCandidateRow(
            source="manual",
            result_id=None,
            candidate_id=str(r.candidate_id),
            user_id=str(r.user_id) if r.user_id else None,
            user_name=r.user_name,
            assessment_id=None,
            assessment_title=None,
            assessment_type="manual",
            risk_level=None,
            total_score=None,
            batch_id=None,
            candidate_status=r.status,
            candidate_kind=r.kind,
            suggestion=r.suggestion,
            priority=r.priority,
            latest_episode_id=None,
            resolved_ref_type=r.resolved_ref_type,
            resolved_ref_id=str(r.resolved_ref_id) if r.resolved_ref_id else None,
            created_at=r.created_at
            if isinstance(r.created_at, datetime)
            else _coerce_dt(r.created_at),
        )
        for r in rows
    ]


# ─── list_triage_buckets ────────────────────────────────────────


async def list_triage_buckets(
    *,
    db: AsyncSession,
    org_id: str,
    batch_id: str | None = None,
    assessment_id: str | None = None,
    counselor_id: str | None = None,
    scope: DataScope | None = None,
) -> TriageBuckets:
    """L1-L4 + unrated count 聚合.

    单 SQL GROUP BY riskLevel (Postgres 端聚合, 不在 Python 端 collect). 与
    crisis dashboard 不一样, 这里 5 bucket 都返回 (level_1 ~ level_4 + unrated).
    """
    _ = counselor_id  # 留参与 Node 接口签名一致

    org_uuid = uuid.UUID(org_id)
    conditions: list[Any] = [
        AssessmentResult.org_id == org_uuid,
        AssessmentResult.deleted_at.is_(None),
        Assessment.assessment_type == "screening",
    ]
    if batch_id:
        conditions.append(AssessmentResult.batch_id == uuid.UUID(batch_id))
    if assessment_id:
        conditions.append(AssessmentResult.assessment_id == uuid.UUID(assessment_id))

    # data_scope='assigned' 过滤
    if scope is not None and scope.type == "assigned":
        if not scope.allowed_client_ids:
            conditions.append(AssessmentResult.user_id.is_(None))
        else:
            allowed = [uuid.UUID(c) for c in scope.allowed_client_ids]
            conditions.append(
                or_(
                    AssessmentResult.user_id.in_(allowed),
                    AssessmentResult.user_id.is_(None),
                )
            )

    q = (
        select(
            AssessmentResult.risk_level,
            func.count().label("count"),
        )
        .select_from(AssessmentResult)
        .join(Assessment, Assessment.id == AssessmentResult.assessment_id)
        .where(and_(*conditions))
        .group_by(AssessmentResult.risk_level)
    )
    rows = (await db.execute(q)).all()

    buckets = TriageBuckets()
    for r in rows:
        risk = r[0]
        cnt_raw = r[1]
        cnt = int(cnt_raw) if cnt_raw is not None else 0
        if risk == "level_1":
            buckets.level_1 = cnt
        elif risk == "level_2":
            buckets.level_2 = cnt
        elif risk == "level_3":
            buckets.level_3 = cnt
        elif risk == "level_4":
            buckets.level_4 = cnt
        else:
            buckets.unrated = cnt
    return buckets


# ─── list_candidates_for_service ───────────────────────────────


async def list_candidates_for_service(
    *,
    db: AsyncSession,
    org_id: str,
    service_type: str,  # 'group' | 'course'
    instance_id: str,
    status_filter: str | None = None,
) -> list[ServiceCandidateRow]:
    """反查"哪些候选目标是这个 group/course instance".

    Powers GroupInstanceDetail / CourseInstanceDetail 的候选 tab.
    数据源: ``candidate_pool.target_group_instance_id`` /
    ``candidate_pool.target_course_instance_id``, 由 rule engine 写入.
    """
    org_uuid = uuid.UUID(org_id)
    inst_uuid = uuid.UUID(instance_id)

    if service_type == "group":
        target_col = CandidatePool.target_group_instance_id
    elif service_type == "course":
        target_col = CandidatePool.target_course_instance_id
    else:
        return []

    conditions: list[Any] = [
        CandidatePool.org_id == org_uuid,
        target_col == inst_uuid,
    ]
    if status_filter:
        conditions.append(CandidatePool.status == status_filter)
    else:
        conditions.append(CandidatePool.status == "pending")

    q = (
        select(
            CandidatePool.id.label("candidate_id"),
            CandidatePool.kind,
            CandidatePool.client_user_id.label("user_id"),
            User.name.label("user_name"),
            CandidatePool.suggestion,
            CandidatePool.reason,
            CandidatePool.priority,
            CandidatePool.status,
            CandidatePool.source_result_id,
            CandidatePool.source_rule_id,
            CandidatePool.created_at,
        )
        .select_from(CandidatePool)
        .outerjoin(User, User.id == CandidatePool.client_user_id)
        .where(and_(*conditions))
        .order_by(desc(CandidatePool.created_at))
    )
    rows = (await db.execute(q)).all()

    return [
        ServiceCandidateRow(
            candidate_id=str(r.candidate_id),
            kind=r.kind,
            user_id=str(r.user_id),
            user_name=r.user_name,
            suggestion=r.suggestion,
            reason=r.reason,
            priority=r.priority,
            status=r.status,
            source_result_id=str(r.source_result_id) if r.source_result_id else None,
            source_rule_id=str(r.source_rule_id) if r.source_rule_id else None,
            created_at=r.created_at
            if isinstance(r.created_at, datetime)
            else _coerce_dt(r.created_at),
        )
        for r in rows
    ]


# ─── update_result_risk_level ──────────────────────────────────


async def update_result_risk_level(
    *,
    db: AsyncSession,
    org_id: str,
    result_id: str,
    risk_level: str,
) -> dict[str, Any]:
    """admin 手工调整 AI 等级.

    返回 ``{id, risk_level}`` 而不是完整 row — Node 端只回这两字段, 让前端最小化
    re-render. 跨 org 防御: WHERE 同时带 ``org_id``, 不存在则 NotFoundError.
    """
    org_uuid = uuid.UUID(org_id)
    r_uuid = uuid.UUID(result_id)

    q = (
        select(AssessmentResult)
        .where(
            and_(
                AssessmentResult.id == r_uuid,
                AssessmentResult.org_id == org_uuid,
            )
        )
        .limit(1)
    )
    result = (await db.execute(q)).scalar_one_or_none()
    if result is None:
        raise NotFoundError("AssessmentResult", result_id)

    result.risk_level = risk_level
    await db.flush()
    return {"id": str(result.id), "riskLevel": result.risk_level}


# ─── lazy_create_candidate (Phase H BUG-007 修复) ────────────


async def lazy_create_candidate(
    *,
    db: AsyncSession,
    org_id: str,
    result_id: str,
    kind: CandidateKind,
    priority: CandidatePriority | None = None,
) -> CandidatePoolRow:
    """把 assessment_results 行"懒"转成 candidate_pool 行.

    Phase H — BUG-007 真正修复. 让"转个案 / 课程·团辅 / 忽略"按钮在没规则引擎的
    机构也能 work.

    设计要点:
      - sourceRuleId=NULL 区分手工创建 vs 规则引擎. queryManual 已经预留
        ``sourceRuleId IS NULL`` 这条路径, 现在补上写入.
      - 防重复 (idempotent): 同 (resultId, kind) 已有 status='pending' 的候选 →
        直接返回那条, 不二次 INSERT.
      - 跨 org: SELECT 时同 ``WHERE org_id=...``, 跨 org 当作不存在 (NotFoundError,
        不泄漏存在性).
      - priority 决策: 显式传入优先, 否则 L4 → urgent, 其他 → normal.
      - suggestion / reason 走默认文案 ("研判分流人工创建 · 风险 ...").
    """
    org_uuid = uuid.UUID(org_id)
    r_uuid = uuid.UUID(result_id)

    # 1) 拿 result + 校验存在 + 同 org + 提取 client_user_id / risk_level
    res_q = (
        select(
            AssessmentResult.id,
            AssessmentResult.org_id,
            AssessmentResult.user_id,
            AssessmentResult.risk_level,
            AssessmentResult.assessment_id,
        )
        .where(
            and_(
                AssessmentResult.id == r_uuid,
                AssessmentResult.org_id == org_uuid,
            )
        )
        .limit(1)
    )
    result_row = (await db.execute(res_q)).first()
    if result_row is None:
        raise NotFoundError("AssessmentResult", result_id)

    user_id = result_row[2]
    res_risk = result_row[3]
    if user_id is None:
        # 匿名 result (公开筛查未登录) 不能转成 candidate, 因为 candidate_pool.client_user_id NOT NULL
        raise NotFoundError("AssessmentResult.userId", result_id)

    # 2) 防重复: 同 (resultId, kind) 已有 pending 候选 → 返回原行
    existing_q = (
        select(CandidatePool)
        .where(
            and_(
                CandidatePool.org_id == org_uuid,
                CandidatePool.source_result_id == r_uuid,
                CandidatePool.kind == kind,
                CandidatePool.status == "pending",
            )
        )
        .limit(1)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing is not None:
        return _candidate_to_row(existing)

    # 3) 决定 priority: 显式 > L4 urgent > 其余 normal
    chosen_priority: CandidatePriority = priority or (
        "urgent" if res_risk == "level_4" else "normal"
    )

    # 4) INSERT
    new_row = CandidatePool(
        org_id=org_uuid,
        client_user_id=user_id,
        kind=kind,
        suggestion="研判分流人工创建",
        reason=f"研判分流人工创建 · 风险 {res_risk or '未分级'}",
        priority=chosen_priority,
        source_rule_id=None,
        source_result_id=r_uuid,
        status="pending",
    )
    db.add(new_row)
    await db.flush()
    return _candidate_to_row(new_row)


def _candidate_to_row(c: CandidatePool) -> CandidatePoolRow:
    """ORM → CandidatePoolRow."""
    return CandidatePoolRow(
        id=str(c.id),
        org_id=str(c.org_id),
        client_user_id=str(c.client_user_id),
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
    )


def _coerce_dt(value: Any) -> datetime:
    """容错: row.created_at 来自 Postgres 应该是 datetime, 但 mock 测试可能给 str.

    单点 fallback, 不让 schema 校验在测试里炸.
    """
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.utcnow()


# 让 lint 不警告 (Decimal 备用 — total_score 是 Numeric)
_ = (Decimal,)


__all__ = [
    "lazy_create_candidate",
    "list_candidates_for_service",
    "list_triage_buckets",
    "list_triage_candidates",
    "update_result_risk_level",
]
