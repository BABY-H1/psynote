"""
Follow-up service helpers — 镜像 ``server/src/modules/follow-up/follow-up.service.ts`` (171 行)。

跟其他 Tier 1+2+3 service 同 pattern: 纯异步函数, 不依赖 FastAPI / Request。

业务逻辑要点:
  - ``createFollowUpPlan``  创建 plan + 写一行 care_timeline event ("制定跟踪计划")
  - ``createFollowUpReview`` 创建 review + 可能更新 episode.current_risk + 可能写
                              risk_change timeline + 写 review timeline + 若 decision='close'
                              则关 episode

⚠ Node 端 list_follow_up_plans 还有一段 dataScope='assigned' 的额外 JOIN
(careEpisodes.client_id ∈ allowedClientIds), Python 端因 Phase 3 的
``allowed_client_ids`` 始终为空 (data_scope.py 注释说 Phase 2 stub), 暂走简化
路径: 路由层若 scope.type == 'assigned' 直接走 SQLAlchemy 同款过滤, 但
``allowedClientIds`` 为空时直接返空 list, 与 Node 一致。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.follow_up.schemas import (
    CreateFollowUpPlanRequest,
    CreateFollowUpReviewRequest,
    FollowUpPlanRow,
    FollowUpReviewRow,
    UpdateFollowUpPlanRequest,
)
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.follow_up_plans import FollowUpPlan
from app.db.models.follow_up_reviews import FollowUpReview
from app.lib.errors import NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise

if TYPE_CHECKING:  # pragma: no cover
    from app.middleware.data_scope import DataScope


# 与 Node service.ts:145-150 一致 — decision → 中文 label 映射
_DECISION_LABELS: dict[str, str] = {
    "continue": "继续当前干预",
    "escalate": "升级干预",
    "deescalate": "降级干预",
    "close": "结案",
}


def _iso(value: object) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _plan_to_row(p: FollowUpPlan) -> FollowUpPlanRow:
    """ORM → wire (与 Node service.ts:50-72 returning row 字段一致).

    Plan ``status`` 在 DB 端有 ``server_default 'active'``, 但内存中刚 INSERT
    的 ORM 实例可能尚未 refresh, ``p.status`` 为 None — 兜底回 ``'active'``。
    """
    return FollowUpPlanRow(
        id=str(p.id),
        org_id=str(p.org_id),
        care_episode_id=str(p.care_episode_id),
        counselor_id=str(p.counselor_id),
        plan_type=p.plan_type,
        assessment_id=str(p.assessment_id) if p.assessment_id else None,
        frequency=p.frequency,
        next_due=_iso(p.next_due),
        status=p.status or "active",
        notes=p.notes,
        created_at=_iso(getattr(p, "created_at", None)),
    )


def _review_to_row(r: FollowUpReview) -> FollowUpReviewRow:
    return FollowUpReviewRow(
        id=str(r.id),
        plan_id=str(r.plan_id),
        care_episode_id=str(r.care_episode_id),
        counselor_id=str(r.counselor_id),
        review_date=_iso(r.review_date),
        result_id=str(r.result_id) if r.result_id else None,
        risk_before=r.risk_before,
        risk_after=r.risk_after,
        clinical_note=r.clinical_note,
        decision=r.decision,
        created_at=_iso(getattr(r, "created_at", None)),
    )


# ─── plans ──────────────────────────────────────────────────────


async def list_follow_up_plans(
    db: AsyncSession,
    org_id: str,
    care_episode_id: str | None = None,
    scope: DataScope | None = None,
) -> list[FollowUpPlanRow]:
    """列出该 org 的随访计划 (镜像 service.ts:10-38).

    若 ``scope.type == 'assigned'`` 且 ``allowed_client_ids`` 为空 → 直接返空 list
    (与 Node 一致 — counselor 没分配任何 client 时不该泄露)。否则按 careEpisode
    ``client_id ∈ allowed_client_ids`` 过滤。
    """
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds = [FollowUpPlan.org_id == org_uuid]
    if care_episode_id:
        conds.append(
            FollowUpPlan.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )

    if scope is not None and scope.type == "assigned":
        if not scope.allowed_client_ids:
            return []
        client_uuids = [
            parse_uuid_or_raise(cid, field="allowedClientId") for cid in scope.allowed_client_ids
        ]
        # JOIN careEpisodes 限定 client_id ∈ allowed
        q = (
            select(FollowUpPlan)
            .join(CareEpisode, CareEpisode.id == FollowUpPlan.care_episode_id)
            .where(
                and_(
                    *conds,
                    CareEpisode.client_id.in_(client_uuids),
                    CareEpisode.org_id == org_uuid,
                )
            )
            .order_by(desc(FollowUpPlan.created_at))
        )
    else:
        q = select(FollowUpPlan).where(and_(*conds)).order_by(desc(FollowUpPlan.created_at))

    rows = list((await db.execute(q)).scalars().all())
    return [_plan_to_row(p) for p in rows]


async def create_follow_up_plan(
    db: AsyncSession,
    *,
    org_id: str,
    counselor_id: str,
    body: CreateFollowUpPlanRequest,
) -> FollowUpPlanRow:
    """创建 plan + 写 timeline event (镜像 service.ts:40-73). Transactional."""
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    episode_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    counselor_uuid = parse_uuid_or_raise(counselor_id, field="counselorId")

    next_due_dt: datetime | None = None
    if body.next_due:
        try:
            # ISO8601 — 与 Node ``new Date(body.nextDue)`` 等价
            next_due_dt = datetime.fromisoformat(body.next_due.replace("Z", "+00:00"))
        except ValueError:
            next_due_dt = None

    assessment_uuid: uuid.UUID | None = None
    if body.assessment_id:
        assessment_uuid = parse_uuid_or_raise(body.assessment_id, field="assessmentId")

    plan = FollowUpPlan(
        org_id=org_uuid,
        care_episode_id=episode_uuid,
        counselor_id=counselor_uuid,
        plan_type=body.plan_type,
        assessment_id=assessment_uuid,
        frequency=body.frequency,
        next_due=next_due_dt,
        notes=body.notes,
    )
    db.add(plan)
    await db.flush()  # 取 plan.id 给 timeline event 用

    # care_timeline 事件 — Node service.ts:62-71
    timeline = CareTimeline(
        care_episode_id=episode_uuid,
        event_type="follow_up_plan",
        ref_id=plan.id,
        title="制定跟踪计划",
        summary=f"类型: {body.plan_type or '复评'} | 频率: {body.frequency or '未设定'}",
        metadata_={"planType": body.plan_type, "frequency": body.frequency},
        created_by=counselor_uuid,
    )
    db.add(timeline)
    await db.flush()
    return _plan_to_row(plan)


async def update_follow_up_plan(
    db: AsyncSession,
    plan_id: str,
    body: UpdateFollowUpPlanRequest,
) -> FollowUpPlanRow:
    """更新 plan (镜像 service.ts:75-92). NotFoundError 若 plan 不存在."""
    plan_uuid = parse_uuid_or_raise(plan_id, field="planId")
    q = select(FollowUpPlan).where(FollowUpPlan.id == plan_uuid).limit(1)
    plan = (await db.execute(q)).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("FollowUpPlan", plan_id)

    if body.frequency is not None:
        plan.frequency = body.frequency
    if body.next_due is not None:
        try:
            plan.next_due = datetime.fromisoformat(body.next_due.replace("Z", "+00:00"))
        except ValueError:
            plan.next_due = None
    if body.status is not None:
        plan.status = body.status
    if body.notes is not None:
        plan.notes = body.notes
    await db.flush()
    return _plan_to_row(plan)


# ─── reviews ────────────────────────────────────────────────────


async def list_follow_up_reviews(
    db: AsyncSession,
    care_episode_id: str,
) -> list[FollowUpReviewRow]:
    """列出某 episode 的所有随访 review (镜像 service.ts:96-102)."""
    episode_uuid = parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
    q = (
        select(FollowUpReview)
        .where(FollowUpReview.care_episode_id == episode_uuid)
        .order_by(desc(FollowUpReview.review_date))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_review_to_row(r) for r in rows]


async def create_follow_up_review(
    db: AsyncSession,
    *,
    counselor_id: str,
    body: CreateFollowUpReviewRequest,
) -> FollowUpReviewRow:
    """
    创建 review + 可能更新 episode + 多条 timeline (镜像 service.ts:104-171)。

    复合事务 (与 Node 一致):
      1. INSERT follow_up_reviews
      2. 若 ``risk_after != risk_before`` → UPDATE care_episodes.current_risk +
         INSERT care_timeline (risk_change)
      3. INSERT care_timeline (follow_up_review)
      4. 若 decision == 'close' → UPDATE care_episodes status='closed' + closed_at
    """
    plan_uuid = parse_uuid_or_raise(body.plan_id, field="planId")
    episode_uuid = parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
    counselor_uuid = parse_uuid_or_raise(counselor_id, field="counselorId")
    result_uuid: uuid.UUID | None = (
        parse_uuid_or_raise(body.result_id, field="resultId") if body.result_id else None
    )

    review = FollowUpReview(
        plan_id=plan_uuid,
        care_episode_id=episode_uuid,
        counselor_id=counselor_uuid,
        result_id=result_uuid,
        risk_before=body.risk_before,
        risk_after=body.risk_after,
        clinical_note=body.clinical_note,
        decision=body.decision,
    )
    db.add(review)
    await db.flush()  # 拿 review.id

    now = datetime.now(UTC)

    # 风险等级更新
    if body.risk_after and body.risk_after != body.risk_before:
        # UPDATE care_episodes
        ep_q = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
        episode = (await db.execute(ep_q)).scalar_one_or_none()
        if episode is not None:
            episode.current_risk = body.risk_after
            episode.updated_at = now
        # 风险变更 timeline
        risk_event = CareTimeline(
            care_episode_id=episode_uuid,
            event_type="risk_change",
            ref_id=review.id,
            title="风险等级变更",
            summary=f"{body.risk_before} → {body.risk_after}",
            metadata_={"riskBefore": body.risk_before, "riskAfter": body.risk_after},
            created_by=counselor_uuid,
        )
        db.add(risk_event)

    # 复评 timeline
    decision_label = _DECISION_LABELS.get(body.decision or "", body.decision or "待定")
    review_event = CareTimeline(
        care_episode_id=episode_uuid,
        event_type="follow_up_review",
        ref_id=review.id,
        title="跟踪复评",
        summary=f"决定: {decision_label}",
        metadata_={"decision": body.decision, "clinicalNote": body.clinical_note},
        created_by=counselor_uuid,
    )
    db.add(review_event)

    # 关闭 episode (与 Node service.ts:163-168)
    if body.decision == "close":
        ep_q2 = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
        episode2 = (await db.execute(ep_q2)).scalar_one_or_none()
        if episode2 is not None:
            episode2.status = "closed"
            episode2.closed_at = now
            episode2.updated_at = now

    await db.flush()
    return _review_to_row(review)


__all__ = [
    "create_follow_up_plan",
    "create_follow_up_review",
    "list_follow_up_plans",
    "list_follow_up_reviews",
    "update_follow_up_plan",
]
