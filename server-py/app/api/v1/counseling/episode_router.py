"""
Care episode router — 镜像 ``server/src/modules/counseling/episode.routes.ts`` (163 行)。

挂在 ``/api/orgs/{org_id}/care-episodes`` prefix。

10 个 endpoint:

  GET    /                          — 列表 (filters: counselorId / clientId / status)
  GET    /{episode_id}              — 详情 (含 PHI access log!)
  GET    /{episode_id}/timeline     — care_timeline 原始事件流
  GET    /{episode_id}/timeline/enriched — Phase 9δ 多源合并 (sessions + assessments + ...)
  POST   /                          — 创建 (admin/counselor) + 写 timeline opening event
  PATCH  /{episode_id}              — 部分更新
  PATCH  /{episode_id}/triage       — 分流决定 + 写 timeline
  POST   /{episode_id}/close        — 关闭 + 写 timeline
  POST   /{episode_id}/reopen       — 重开 + 写 timeline

PHI 接通点位:
  - GET /{episode_id} → ``record_phi_access(action='view', resource='care_episodes',
    data_class='phi_full')`` (镜像 routes.ts:71)

RBAC 守门:
  - 所有 GET 需 OrgContext (rejectClient 由 data_scope 自动)
  - 所有写入 (POST / PATCH 三个) require ``org_admin`` or ``counselor``
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, asc, desc, select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    CloseRequest,
    EnrichedTimelineItem,
    EpisodeCreateRequest,
    EpisodeDetail,
    EpisodeListItem,
    EpisodeOutput,
    EpisodeUpdateRequest,
    TimelineEvent,
    TimelineRef,
    TriageRequest,
)
from app.core.database import get_db
from app.db.models.appointments import Appointment
from app.db.models.assessment_results import AssessmentResult
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.course_enrollments import CourseEnrollment
from app.db.models.follow_up_reviews import FollowUpReview
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.referrals import Referral
from app.db.models.session_notes import SessionNote
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.phi_access import record_phi_access

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    """``requireRole('org_admin', 'counselor')`` 等价 (legacy role)."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _episode_to_output(e: CareEpisode) -> EpisodeOutput:
    return EpisodeOutput(
        id=str(e.id),
        org_id=str(e.org_id),
        client_id=str(e.client_id),
        counselor_id=str(e.counselor_id) if e.counselor_id else None,
        status=e.status or "active",
        chief_complaint=e.chief_complaint,
        current_risk=e.current_risk or "level_1",
        intervention_type=e.intervention_type,
        opened_at=e.opened_at,
        closed_at=e.closed_at,
        created_at=getattr(e, "created_at", None),
        updated_at=getattr(e, "updated_at", None),
    )


def _episode_to_detail(
    e: CareEpisode, client_name: str | None, client_email: str | None
) -> EpisodeDetail:
    base = _episode_to_output(e).model_dump(by_alias=False)
    return EpisodeDetail(**base, client={"name": client_name, "email": client_email})


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[EpisodeListItem])
async def list_episodes(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
    client_id: Annotated[str | None, Query(alias="clientId")] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> list[EpisodeListItem]:
    """``GET /`` 列表 + 富化 (镜像 routes.ts:53-56 + service.ts:8-62).

    富化字段:
      - ``client``: ``{name, email}`` 来自 LEFT JOIN users
      - ``next_appointment``: 该 episode 下未来最近的 pending/confirmed appt 时间
      - ``session_count``: 该 episode 下 session_notes 的总数
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [CareEpisode.org_id == org_uuid]
    if counselor_id:
        conds.append(
            CareEpisode.counselor_id == parse_uuid_or_raise(counselor_id, field="counselorId")
        )
    if client_id:
        conds.append(CareEpisode.client_id == parse_uuid_or_raise(client_id, field="clientId"))
    if status_filter:
        conds.append(CareEpisode.status == status_filter)

    q = (
        select(CareEpisode, User.name, User.email)
        .join(User, User.id == CareEpisode.client_id, isouter=True)
        .where(and_(*conds))
        .order_by(desc(CareEpisode.updated_at))
    )
    rows = list((await db.execute(q)).all())

    out: list[EpisodeListItem] = []
    for row in rows:
        ep, client_name, client_email = row[0], row[1], row[2]

        # Next upcoming appointment (pending/confirmed, start_time > now)
        appt_q = (
            select(Appointment.start_time)
            .where(
                and_(
                    Appointment.care_episode_id == ep.id,
                    Appointment.start_time > datetime.now(tz=UTC),
                    Appointment.status.in_(["pending", "confirmed"]),
                )
            )
            .order_by(asc(Appointment.start_time))
            .limit(1)
        )
        next_appt = (await db.execute(appt_q)).scalar()

        # Session note count
        cnt_q = (
            select(sa_func.count())
            .select_from(SessionNote)
            .where(SessionNote.care_episode_id == ep.id)
        )
        note_cnt = (await db.execute(cnt_q)).scalar() or 0

        base = _episode_to_detail(ep, client_name, client_email).model_dump(by_alias=False)
        out.append(
            EpisodeListItem(
                **base,
                next_appointment=next_appt.isoformat() if next_appt else None,
                session_count=int(note_cnt),
            )
        )
    return out


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=EpisodeOutput, status_code=status.HTTP_201_CREATED)
async def create_episode(
    org_id: str,
    body: EpisodeCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpisodeOutput:
    """``POST /`` 创建个案 (admin/counselor only). 镜像 routes.ts:91-107 + service.ts:84-112.

    Transactional: episode + opening timeline event 单 commit.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    counselor_uuid = (
        parse_uuid_or_raise(body.counselor_id, field="counselorId")
        if body.counselor_id
        else parse_uuid_or_raise(user.id, field="userId")
    )

    try:
        episode = CareEpisode(
            org_id=org_uuid,
            client_id=client_uuid,
            counselor_id=counselor_uuid,
            chief_complaint=body.chief_complaint,
            current_risk=body.current_risk or "level_1",
            intervention_type=body.intervention_type,
        )
        db.add(episode)
        await db.flush()  # 取 episode.id 给 timeline 用

        timeline_event = CareTimeline(
            care_episode_id=episode.id,
            event_type="note",
            title="开启个案",
            summary=body.chief_complaint or "新个案已创建",
            metadata_={
                "interventionType": body.intervention_type,
                "risk": body.current_risk,
            },
            created_by=counselor_uuid,
        )
        db.add(timeline_event)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="care_episodes",
        resource_id=str(episode.id),
        ip_address=request.client.host if request.client else None,
    )
    return _episode_to_output(episode)


# ─── GET /{episode_id} 详情 (PHI access log!) ───────────────────


@router.get("/{episode_id}", response_model=EpisodeDetail)
async def get_episode(
    org_id: str,
    episode_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpisodeDetail:
    """``GET /{episode_id}`` 详情 — 镜像 routes.ts:59-73 + service.ts:64-82.

    ⚠ PHI access log: care_episode 含主诉 / 风险 / 干预说明, ``phi_full`` 级别。
    必须 ``record_phi_access(action='view')``。
    """
    _require_org(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")

    q = (
        select(CareEpisode, User.name, User.email)
        .join(User, User.id == CareEpisode.client_id, isouter=True)
        .where(CareEpisode.id == episode_uuid)
        .limit(1)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("CareEpisode", episode_id)
    episode = row[0]

    # PHI access log (镜像 routes.ts:71)
    await record_phi_access(
        db=db,
        org_id=org_id if org else "",
        user_id=user.id,
        client_id=str(episode.client_id),
        resource="care_episodes",
        action="view",
        resource_id=episode_id,
        data_class="phi_full",
        actor_role_snapshot=org.role_v2 if org else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _episode_to_detail(episode, row[1], row[2])


# ─── GET /{episode_id}/timeline ────────────────────────────────


@router.get("/{episode_id}/timeline", response_model=list[TimelineEvent])
async def get_timeline(
    org_id: str,
    episode_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TimelineEvent]:
    """``GET /{episode_id}/timeline`` 原始 care_timeline 事件流 (镜像 service.ts:215-221)."""
    _require_org(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")
    q = (
        select(CareTimeline)
        .where(CareTimeline.care_episode_id == episode_uuid)
        .order_by(desc(CareTimeline.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [
        TimelineEvent(
            id=str(t.id),
            care_episode_id=str(t.care_episode_id),
            event_type=t.event_type,
            ref_id=str(t.ref_id) if t.ref_id else None,
            title=t.title,
            summary=t.summary,
            metadata=t.metadata_ or {},
            created_by=str(t.created_by) if t.created_by else None,
            created_at=getattr(t, "created_at", None),
        )
        for t in rows
    ]


# ─── GET /{episode_id}/timeline/enriched ───────────────────────


@router.get("/{episode_id}/timeline/enriched", response_model=list[EnrichedTimelineItem])
async def get_enriched_timeline(
    org_id: str,
    episode_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EnrichedTimelineItem]:
    """``GET /{episode_id}/timeline/enriched`` Phase 9δ 多源合并 (镜像 service.ts:232-365).

    汇总 7 个源:
      1. care_timeline (event)
      2. session_notes
      3. assessment_results
      4. group_enrollments
      5. course_enrollments
      6. referrals
      7. follow_up_reviews

    全部按时间 desc 排序。空 episode → []。
    """
    _require_org(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")

    # 校验 episode 存在 (Node service.ts:233-238 — 不存在返 [])
    epq = select(CareEpisode.id).where(CareEpisode.id == episode_uuid).limit(1)
    if (await db.execute(epq)).first() is None:
        return []

    events: list[EnrichedTimelineItem] = []

    # 1. care_timeline
    tlq = select(CareTimeline).where(CareTimeline.care_episode_id == episode_uuid)
    for t in (await db.execute(tlq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(t.id),
                kind="event",
                occurred_at=getattr(t, "created_at", None),
                title=t.title,
                summary=t.summary,
                ref=TimelineRef(type=t.event_type, id=str(t.ref_id) if t.ref_id else None),
            )
        )

    # 2. session notes
    notesq = select(SessionNote).where(SessionNote.care_episode_id == episode_uuid)
    for n in (await db.execute(notesq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(n.id),
                kind="session_note",
                occurred_at=getattr(n, "created_at", None),
                title="会谈记录",
                summary=None,
                ref=TimelineRef(type="session_note", id=str(n.id)),
            )
        )

    # 3. assessment results
    resq = select(AssessmentResult).where(AssessmentResult.care_episode_id == episode_uuid)
    for r in (await db.execute(resq)).scalars().all():
        score_str = str(r.total_score) if r.total_score is not None else "—"
        events.append(
            EnrichedTimelineItem(
                id=str(r.id),
                kind="assessment_result",
                occurred_at=getattr(r, "created_at", None),
                title=f"测评 ({score_str} 分)",
                summary=r.risk_level,
                ref=TimelineRef(type="assessment_result", id=str(r.id)),
            )
        )

    # 4. group enrollments
    geq = select(GroupEnrollment).where(GroupEnrollment.care_episode_id == episode_uuid)
    for ge in (await db.execute(geq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(ge.id),
                kind="group_enrollment",
                occurred_at=ge.enrolled_at or getattr(ge, "created_at", None),
                title="加入团辅",
                ref=TimelineRef(type="group_enrollment", id=str(ge.id)),
            )
        )

    # 5. course enrollments
    ceq = select(CourseEnrollment).where(CourseEnrollment.care_episode_id == episode_uuid)
    for ce in (await db.execute(ceq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(ce.id),
                kind="course_enrollment",
                occurred_at=ce.enrolled_at,
                title="加入课程",
                ref=TimelineRef(type="course_enrollment", id=str(ce.id)),
            )
        )

    # 6. referrals
    refq = select(Referral).where(Referral.care_episode_id == episode_uuid)
    for ref_row in (await db.execute(refq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(ref_row.id),
                kind="referral",
                occurred_at=getattr(ref_row, "created_at", None),
                title=f"转介 ({ref_row.status})",
                summary=ref_row.target_name,
                ref=TimelineRef(type="referral", id=str(ref_row.id)),
            )
        )

    # 7. follow-up reviews
    fuq = select(FollowUpReview).where(FollowUpReview.care_episode_id == episode_uuid)
    for fr in (await db.execute(fuq)).scalars().all():
        events.append(
            EnrichedTimelineItem(
                id=str(fr.id),
                kind="follow_up_review",
                occurred_at=getattr(fr, "created_at", None),
                title="随访回顾",
                ref=TimelineRef(type="follow_up_review", id=str(fr.id)),
            )
        )

    # Sort by occurred_at desc, None → 0
    def _sort_key(item: EnrichedTimelineItem) -> float:
        return item.occurred_at.timestamp() if item.occurred_at else 0.0

    events.sort(key=_sort_key, reverse=True)
    return events


# ─── PATCH /{episode_id} 部分更新 ──────────────────────────────


@router.patch("/{episode_id}", response_model=EpisodeOutput)
async def update_episode(
    org_id: str,
    episode_id: str,
    body: EpisodeUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpisodeOutput:
    """``PATCH /{episode_id}`` 部分更新 (admin/counselor only). 镜像 service.ts:114-132。"""
    _require_admin_or_counselor(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")

    q = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
    episode = (await db.execute(q)).scalar_one_or_none()
    if episode is None:
        raise NotFoundError("CareEpisode", episode_id)

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    if "counselor_id" in updates:
        cid = updates.pop("counselor_id")
        episode.counselor_id = parse_uuid_or_raise(cid, field="counselorId") if cid else None
    for field_name, value in updates.items():
        setattr(episode, field_name, value)
    episode.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="care_episodes",
        resource_id=episode_id,
        ip_address=request.client.host if request.client else None,
    )
    return _episode_to_output(episode)


# ─── PATCH /{episode_id}/triage ────────────────────────────────


@router.patch("/{episode_id}/triage", response_model=EpisodeOutput)
async def confirm_triage(
    org_id: str,
    episode_id: str,
    body: TriageRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpisodeOutput:
    """``PATCH /{episode_id}/triage`` 分流决定 (admin/counselor only). 镜像 service.ts:135-171.

    Transactional: 更新 episode + 写 timeline triage_decision 单 commit.
    """
    _require_admin_or_counselor(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        q = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
        episode = (await db.execute(q)).scalar_one_or_none()
        if episode is None:
            raise NotFoundError("CareEpisode", episode_id)

        episode.current_risk = body.current_risk
        episode.intervention_type = body.intervention_type
        episode.updated_at = datetime.now(UTC)

        timeline_event = CareTimeline(
            care_episode_id=episode_uuid,
            event_type="triage_decision",
            title="分流决定已确认",
            summary=body.note
            or f"风险等级: {body.current_risk}, 干预方式: {body.intervention_type}",
            metadata_={
                "riskLevel": body.current_risk,
                "interventionType": body.intervention_type,
                "confirmed": True,
            },
            created_by=user_uuid,
        )
        db.add(timeline_event)
        await db.commit()
    except (NotFoundError, ForbiddenError):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="care_episodes",
        resource_id=episode_id,
        ip_address=request.client.host if request.client else None,
    )
    return _episode_to_output(episode)


# ─── POST /{episode_id}/close ──────────────────────────────────


@router.post("/{episode_id}/close", response_model=EpisodeOutput)
async def close_episode(
    org_id: str,
    episode_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: CloseRequest | None = None,
) -> EpisodeOutput:
    """``POST /{episode_id}/close`` (admin/counselor). 镜像 service.ts:174-192."""
    _require_admin_or_counselor(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    reason = body.reason if body else None

    try:
        q = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
        episode = (await db.execute(q)).scalar_one_or_none()
        if episode is None:
            raise NotFoundError("CareEpisode", episode_id)

        now = datetime.now(UTC)
        episode.status = "closed"
        episode.closed_at = now
        episode.updated_at = now

        timeline_event = CareTimeline(
            care_episode_id=episode_uuid,
            event_type="note",
            title="个案结案",
            summary=reason or "个案已关闭",
            created_by=user_uuid,
        )
        db.add(timeline_event)
        await db.commit()
    except (NotFoundError, ForbiddenError):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="care_episodes",
        resource_id=episode_id,
        ip_address=request.client.host if request.client else None,
    )
    return _episode_to_output(episode)


# ─── POST /{episode_id}/reopen ─────────────────────────────────


@router.post("/{episode_id}/reopen", response_model=EpisodeOutput)
async def reopen_episode(
    org_id: str,
    episode_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpisodeOutput:
    """``POST /{episode_id}/reopen`` 重开已关闭个案 (admin/counselor). 镜像 service.ts:194-212."""
    _require_admin_or_counselor(org)
    episode_uuid = parse_uuid_or_raise(episode_id, field="episodeId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        q = select(CareEpisode).where(CareEpisode.id == episode_uuid).limit(1)
        episode = (await db.execute(q)).scalar_one_or_none()
        if episode is None:
            raise NotFoundError("CareEpisode", episode_id)

        episode.status = "active"
        episode.closed_at = None
        episode.updated_at = datetime.now(UTC)

        timeline_event = CareTimeline(
            care_episode_id=episode_uuid,
            event_type="note",
            title="个案重新开启",
            summary="个案已重新激活",
            created_by=user_uuid,
        )
        db.add(timeline_event)
        await db.commit()
    except (NotFoundError, ForbiddenError):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="care_episodes",
        resource_id=episode_id,
        ip_address=request.client.host if request.client else None,
    )
    return _episode_to_output(episode)


__all__ = ["router"]
