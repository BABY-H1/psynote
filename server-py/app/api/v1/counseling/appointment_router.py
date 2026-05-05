"""
Appointment router — 镜像 ``server/src/modules/counseling/appointment.routes.ts`` (93 行)。

挂在 ``/api/orgs/{org_id}/appointments`` prefix。

4 个 endpoint:

  GET    /                              — 列表 (filters: counselorId / clientId / status / from / to)
  GET    /{appointment_id}              — 详情
  POST   /                              — 创建 (admin/counselor) + 写 timeline (如果 careEpisodeId)
  PATCH  /{appointment_id}/status       — 更新 status (admin/counselor) + 写 timeline

RBAC:
  - 所有 GET 需 OrgContext
  - POST / PATCH 需 admin/counselor

Node service.ts checkConflict / createClientRequest / getAvailableTimeSlots
为 internal helpers, 路由只调 listAppointments / getAppointmentById /
createAppointment / updateAppointmentStatus 这 4 个。client_request 端点
在 Node 里也没暴露 (仅 service 函数), 所以这里也不实现。

Node 端 EAP event_emitter (eap-event-emitter.js) 是 fire-and-forget side effect
(异步 import) — Phase 5 EAP 模块 port 时再接通, 此处暂 skip。
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    AppointmentCreateRequest,
    AppointmentListItem,
    AppointmentOutput,
    AppointmentStatusRequest,
)
from app.core.database import get_db
from app.db.models.appointments import Appointment
from app.db.models.care_timeline import CareTimeline
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import require_admin_or_counselor as _require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _appt_to_output(a: Appointment) -> AppointmentOutput:
    return AppointmentOutput(
        id=str(a.id),
        org_id=str(a.org_id),
        care_episode_id=str(a.care_episode_id) if a.care_episode_id else None,
        client_id=str(a.client_id),
        counselor_id=str(a.counselor_id),
        start_time=a.start_time,
        end_time=a.end_time,
        status=a.status or "pending",
        type=a.type,
        source=a.source,
        notes=a.notes,
        reminder_sent_24h=bool(a.reminder_sent_24h),
        reminder_sent_1h=bool(a.reminder_sent_1h),
        client_confirmed_at=a.client_confirmed_at,
        confirm_token=a.confirm_token,
        created_at=getattr(a, "created_at", None),
    )


def _appt_to_list_item(a: Appointment, client_name: str | None) -> AppointmentListItem:
    base = _appt_to_output(a).model_dump(by_alias=False)
    return AppointmentListItem(**base, client_name=client_name)


_STATUS_LABELS: dict[str, str] = {
    "confirmed": "预约已确认",
    "completed": "预约已完成",
    "cancelled": "预约已取消",
    "no_show": "来访者未到",
}


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[AppointmentListItem])
async def list_appointments(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
    client_id: Annotated[str | None, Query(alias="clientId")] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    from_dt: Annotated[datetime | None, Query(alias="from")] = None,
    to_dt: Annotated[datetime | None, Query(alias="to")] = None,
) -> list[AppointmentListItem]:
    """``GET /`` 列表 (镜像 routes.ts:16-32 + service.ts:9-37)."""
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [Appointment.org_id == org_uuid]
    if counselor_id:
        conds.append(
            Appointment.counselor_id == parse_uuid_or_raise(counselor_id, field="counselorId")
        )
    if client_id:
        conds.append(Appointment.client_id == parse_uuid_or_raise(client_id, field="clientId"))
    if status_filter:
        conds.append(Appointment.status == status_filter)
    if from_dt:
        conds.append(Appointment.start_time >= from_dt)
    if to_dt:
        conds.append(Appointment.start_time <= to_dt)

    q = (
        select(Appointment, User.name)
        .join(User, User.id == Appointment.client_id, isouter=True)
        .where(and_(*conds))
        .order_by(desc(Appointment.start_time))
    )
    rows = list((await db.execute(q)).all())
    return [_appt_to_list_item(row[0], row[1]) for row in rows]


# ─── GET /{appointment_id} ─────────────────────────────────────


@router.get("/{appointment_id}", response_model=AppointmentOutput)
async def get_appointment(
    org_id: str,
    appointment_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppointmentOutput:
    """``GET /{appointment_id}`` 详情。"""
    _require_org(org)
    appt_uuid = parse_uuid_or_raise(appointment_id, field="appointmentId")
    q = select(Appointment).where(Appointment.id == appt_uuid).limit(1)
    appt = (await db.execute(q)).scalar_one_or_none()
    if appt is None:
        raise NotFoundError("Appointment", appointment_id)
    return _appt_to_output(appt)


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=AppointmentOutput, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    org_id: str,
    body: AppointmentCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppointmentOutput:
    """``POST /`` 创建 (admin/counselor). 镜像 routes.ts:42-72 + service.ts:50-96.

    Transactional: appointment + (可选) timeline 单 commit.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    counselor_uuid = (
        parse_uuid_or_raise(body.counselor_id, field="counselorId")
        if body.counselor_id
        else parse_uuid_or_raise(user.id, field="userId")
    )
    care_uuid = (
        parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
        if body.care_episode_id
        else None
    )

    try:
        appt = Appointment(
            org_id=org_uuid,
            care_episode_id=care_uuid,
            client_id=client_uuid,
            counselor_id=counselor_uuid,
            start_time=body.start_time,
            end_time=body.end_time,
            type=body.type,
            source=body.source or "counselor_manual",
            notes=body.notes,
        )
        db.add(appt)
        await db.flush()  # 拿 appt.id

        if care_uuid:
            day_str = body.start_time.strftime("%Y-%m-%d") if body.start_time else ""
            db.add(
                CareTimeline(
                    care_episode_id=care_uuid,
                    event_type="appointment",
                    ref_id=appt.id,
                    title="新预约已创建",
                    summary=f"{body.type or '咨询'} | {day_str}",
                    metadata_={
                        "startTime": body.start_time.isoformat() if body.start_time else None,
                        "endTime": body.end_time.isoformat() if body.end_time else None,
                        "type": body.type,
                    },
                    created_by=counselor_uuid,
                )
            )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="appointments",
        resource_id=str(appt.id),
        ip_address=request.client.host if request.client else None,
    )
    return _appt_to_output(appt)


# ─── PATCH /{appointment_id}/status ────────────────────────────


@router.patch("/{appointment_id}/status", response_model=AppointmentOutput)
async def update_appointment_status(
    org_id: str,
    appointment_id: str,
    body: AppointmentStatusRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppointmentOutput:
    """``PATCH /{appointment_id}/status`` (admin/counselor). 镜像 routes.ts:75-91 + service.ts:99-128."""
    _require_admin_or_counselor(org)
    appt_uuid = parse_uuid_or_raise(appointment_id, field="appointmentId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        q = select(Appointment).where(Appointment.id == appt_uuid).limit(1)
        appt = (await db.execute(q)).scalar_one_or_none()
        if appt is None:
            raise NotFoundError("Appointment", appointment_id)

        appt.status = body.status

        # Timeline event (only if linked to episode)
        if appt.care_episode_id is not None:
            label = _STATUS_LABELS.get(body.status, f"预约状态变更: {body.status}")
            db.add(
                CareTimeline(
                    care_episode_id=appt.care_episode_id,
                    event_type="appointment",
                    ref_id=appt.id,
                    title=label,
                    created_by=user_uuid,
                )
            )
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
        resource="appointments",
        resource_id=appointment_id,
        ip_address=request.client.host if request.client else None,
    )
    return _appt_to_output(appt)


__all__ = ["router"]
