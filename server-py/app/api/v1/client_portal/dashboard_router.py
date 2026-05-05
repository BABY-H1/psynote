"""Client portal dashboard + timeline router.

镜像 ``server/src/modules/client-portal/client-dashboard.routes.ts``:
  GET /dashboard  — caller's health overview (active episode + recent results +
                    upcoming appointments + unread notif count)
                    **Phase 14**: ``?as=`` 监护人代查时, ``recentResults`` 强制清空
                    (家长不能看孩子测评结果)。
  GET /timeline   — caller's care timeline. ``?as=`` 拒绝 (rejectAsParam).

self_only / 监护人代查统一靠 ``shared.resolve_target_user_id`` / ``reject_as_param``.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.shared import reject_as_param, resolve_target_user_id
from app.core.database import get_db
from app.db.models.appointments import Appointment
from app.db.models.assessment_results import AssessmentResult
from app.db.models.care_episodes import CareEpisode
from app.db.models.care_timeline import CareTimeline
from app.db.models.notifications import Notification
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _episode_to_dict(e: CareEpisode | None) -> dict[str, Any] | None:
    if e is None:
        return None
    return {
        "id": str(e.id),
        "orgId": str(e.org_id),
        "clientId": str(e.client_id),
        "counselorId": str(e.counselor_id) if e.counselor_id else None,
        "status": e.status,
        "chiefComplaint": e.chief_complaint,
        "currentRisk": e.current_risk,
        "interventionType": e.intervention_type,
        "openedAt": e.opened_at.isoformat() if e.opened_at else None,
        "closedAt": e.closed_at.isoformat() if e.closed_at else None,
    }


def _result_to_dict(r: AssessmentResult) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "orgId": str(r.org_id),
        "assessmentId": str(r.assessment_id),
        "userId": str(r.user_id) if r.user_id else None,
        "careEpisodeId": str(r.care_episode_id) if r.care_episode_id else None,
        "totalScore": float(r.total_score) if r.total_score is not None else None,
        "riskLevel": r.risk_level,
        "aiInterpretation": r.ai_interpretation,
        "clientVisible": r.client_visible,
        "createdAt": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
    }


def _appointment_to_dict(a: Appointment) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "orgId": str(a.org_id),
        "clientId": str(a.client_id),
        "counselorId": str(a.counselor_id),
        "startTime": a.start_time.isoformat() if a.start_time else None,
        "endTime": a.end_time.isoformat() if a.end_time else None,
        "status": a.status,
        "type": a.type,
        "notes": a.notes,
    }


def _timeline_to_dict(t: CareTimeline) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "careEpisodeId": str(t.care_episode_id),
        "eventType": t.event_type,
        "refId": str(t.ref_id) if t.ref_id else None,
        "title": t.title,
        "summary": t.summary,
        "metadata": t.metadata_,
        "createdAt": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


# ─── GET /dashboard ─────────────────────────────────────────────


@router.get("/dashboard")
async def get_dashboard(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """监护人可读 (``?as=``). Phase 14: ``recentResults`` 在 viewing-as 时清空."""
    assert org is not None  # path 含 {org_id}, get_org_context 必填
    caller_uuid = parse_uuid_or_raise(user.id, field="userId")
    target_uuid = await resolve_target_user_id(request, user, org, db)
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    is_viewing_as = target_uuid != caller_uuid

    # active episode
    ep_q = (
        select(CareEpisode)
        .where(
            and_(
                CareEpisode.org_id == org_uuid,
                CareEpisode.client_id == target_uuid,
                CareEpisode.status == "active",
            )
        )
        .order_by(desc(CareEpisode.updated_at))
        .limit(1)
    )
    episode = (await db.execute(ep_q)).scalar_one_or_none()

    # recent results — Phase 14: NEVER 暴露给监护人. viewing-as 时直接空数组
    recent_results: list[AssessmentResult] = []
    if not is_viewing_as:
        rr_q = (
            select(AssessmentResult)
            .where(
                and_(
                    AssessmentResult.org_id == org_uuid,
                    AssessmentResult.user_id == target_uuid,
                    AssessmentResult.deleted_at.is_(None),
                )
            )
            .order_by(desc(AssessmentResult.created_at))
            .limit(5)
        )
        recent_results = list((await db.execute(rr_q)).scalars().all())

    # upcoming appts (confirmed only, by start_time asc, limit 3)
    appt_q = (
        select(Appointment)
        .where(
            and_(
                Appointment.org_id == org_uuid,
                Appointment.client_id == target_uuid,
                Appointment.status == "confirmed",
            )
        )
        .order_by(Appointment.start_time)
        .limit(3)
    )
    upcoming = list((await db.execute(appt_q)).scalars().all())

    # unread notif (target user). 监护人侧也看 target 的 unread 数, 用作徽章.
    notif_q = select(Notification).where(
        and_(
            Notification.org_id == org_uuid,
            Notification.user_id == target_uuid,
            Notification.is_read.is_(False),
        )
    )
    unread = list((await db.execute(notif_q)).scalars().all())

    return {
        "episode": _episode_to_dict(episode),
        "recentResults": [_result_to_dict(r) for r in recent_results],
        "upcomingAppointments": [_appointment_to_dict(a) for a in upcoming],
        "unreadNotificationCount": len(unread),
    }


# ─── GET /timeline ──────────────────────────────────────────────


@router.get("/timeline")
async def get_timeline(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-blocked. ``?as=`` 拒绝. 镜像 client-dashboard.routes.ts:81-102."""
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    ep_q = select(CareEpisode.id).where(
        and_(CareEpisode.org_id == org_uuid, CareEpisode.client_id == user_uuid)
    )
    episode_ids: list[Any] = list((await db.execute(ep_q)).scalars().all())
    if not episode_ids:
        return []

    tl_q = (
        select(CareTimeline)
        .where(or_(*[CareTimeline.care_episode_id == eid for eid in episode_ids]))
        .order_by(desc(CareTimeline.created_at))
        .limit(50)
    )
    rows = list((await db.execute(tl_q)).scalars().all())
    return [_timeline_to_dict(t) for t in rows]


__all__ = ["router"]
