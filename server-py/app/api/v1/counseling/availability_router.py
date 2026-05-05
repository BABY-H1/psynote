"""
Availability router — 镜像 ``server/src/modules/counseling/availability.routes.ts`` (95 行)。

挂在 ``/api/orgs/{org_id}/availability`` prefix。

5 个 endpoint:

  GET    /                 — 列表 (counselor 自己 / admin 看任意 counselor)
  GET    /slots            — 计算某日可预约空闲窗口
  POST   /                 — 新建 slot (admin/counselor; 校验 dayOfWeek 0-6 + start<end + 不重叠)
  PATCH  /{slot_id}        — 更新 slot
  DELETE /{slot_id}        — 删除 slot

RBAC 守门:
  - 全 router rejectClient (legacy role='client' 一律 403)
  - POST/PATCH/DELETE require ``org_admin`` or ``counselor``

业务校验:
  - dayOfWeek 必须 0-6
  - startTime < endTime (字符串字典序对比 "HH:mm" 格式合法)
  - 同 (org, counselor, dayOfWeek) 不重叠 (与已有 slots)
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, asc, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    AvailabilityCreateRequest,
    AvailabilityOutput,
    AvailabilityUpdateRequest,
    FreeWindowOutput,
)
from app.core.database import get_db
from app.db.models.appointments import Appointment
from app.db.models.counselor_availability import CounselorAvailability
from app.lib.errors import (
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import reject_client, require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _reject_client(org: OrgContext | None) -> OrgContext:
    return reject_client(org, client_message="来访者请通过客户端门户访问")


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    return require_admin_or_counselor(org)


def _slot_to_output(s: CounselorAvailability) -> AvailabilityOutput:
    return AvailabilityOutput(
        id=str(s.id),
        org_id=str(s.org_id),
        counselor_id=str(s.counselor_id),
        day_of_week=s.day_of_week,
        start_time=s.start_time,
        end_time=s.end_time,
        session_type=s.session_type,
        is_active=bool(s.is_active),
        created_at=getattr(s, "created_at", None),
    )


def _to_hhmm(dt: datetime) -> str:
    """Datetime → 'HH:mm' (用 hours+minutes 与 Node service.ts:210-212 一致)。"""
    return f"{dt.hour:02d}:{dt.minute:02d}"


def _subtract_range(windows: list[dict[str, str]], booked: dict[str, str]) -> list[dict[str, str]]:
    """从 free windows 列表里减去一段已预约范围 (镜像 service.ts:217-238)。"""
    result: list[dict[str, str]] = []
    for w in windows:
        if booked["end"] <= w["start"] or booked["start"] >= w["end"]:
            # 无重叠
            result.append(w)
        else:
            # 重叠 — 拆
            if booked["start"] > w["start"]:
                result.append({"start": w["start"], "end": booked["start"]})
            if booked["end"] < w["end"]:
                result.append({"start": booked["end"], "end": w["end"]})
    return result


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[AvailabilityOutput])
async def list_availability(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
) -> list[AvailabilityOutput]:
    """``GET /`` 列表 (counselor 自己, admin 可指定; 镜像 routes.ts:16-20)."""
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    target_counselor = counselor_id or user.id
    counselor_uuid = parse_uuid_or_raise(target_counselor, field="counselorId")

    q = (
        select(CounselorAvailability)
        .where(
            and_(
                CounselorAvailability.org_id == org_uuid,
                CounselorAvailability.counselor_id == counselor_uuid,
            )
        )
        .order_by(asc(CounselorAvailability.day_of_week), asc(CounselorAvailability.start_time))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_slot_to_output(s) for s in rows]


# ─── GET /slots — 计算空闲窗口 ────────────────────────────────


@router.get("/slots", response_model=list[FreeWindowOutput])
async def list_free_slots(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> list[FreeWindowOutput]:
    """``GET /slots?counselorId=&date=YYYY-MM-DD`` 镜像 routes.ts:23-34 + service.ts:130-208。

    扣除 pending / confirmed appointments 后的可预约窗口。
    """
    _reject_client(org)
    if not counselor_id:
        raise ValidationError("counselorId is required")
    if not date_str:
        raise ValidationError("date is required")
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    counselor_uuid = parse_uuid_or_raise(counselor_id, field="counselorId")

    target_date = datetime.fromisoformat(date_str)
    day_of_week = target_date.weekday()  # Mon=0, Sun=6
    # 与 Node Date.getUTCDay() 对齐: 0=Sunday, weekday() 是 Mon=0; 调整
    # Node: 0=Sun ... 6=Sat
    day_of_week = (day_of_week + 1) % 7

    # 1. active slots
    sq = (
        select(CounselorAvailability)
        .where(
            and_(
                CounselorAvailability.org_id == org_uuid,
                CounselorAvailability.counselor_id == counselor_uuid,
                CounselorAvailability.day_of_week == day_of_week,
                CounselorAvailability.is_active.is_(True),
            )
        )
        .order_by(asc(CounselorAvailability.start_time))
    )
    slots = list((await db.execute(sq)).scalars().all())
    if not slots:
        return []

    # 2. 已订时段
    day_start = datetime.fromisoformat(f"{date_str}T00:00:00")
    day_end = datetime.fromisoformat(f"{date_str}T23:59:59")
    aq = select(Appointment.start_time, Appointment.end_time).where(
        and_(
            Appointment.org_id == org_uuid,
            Appointment.counselor_id == counselor_uuid,
            Appointment.start_time >= day_start,
            Appointment.start_time <= day_end,
            Appointment.status.in_(["pending", "confirmed"]),
        )
    )
    booked_rows = list((await db.execute(aq)).all())
    booked_ranges: list[dict[str, str]] = [
        {"start": _to_hhmm(r[0]), "end": _to_hhmm(r[1])} for r in booked_rows
    ]

    # 3. 减
    free_windows: list[FreeWindowOutput] = []
    for slot in slots:
        windows: list[dict[str, str]] = [{"start": slot.start_time, "end": slot.end_time}]
        for booked in booked_ranges:
            windows = _subtract_range(windows, booked)
        for w in windows:
            free_windows.append(
                FreeWindowOutput(start=w["start"], end=w["end"], session_type=slot.session_type)
            )
    return free_windows


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=AvailabilityOutput, status_code=status.HTTP_201_CREATED)
async def create_availability(
    org_id: str,
    body: AvailabilityCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AvailabilityOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:38-65 + service.ts:17-58."""
    _reject_client(org)
    _require_admin_or_counselor(org)

    if body.day_of_week < 0 or body.day_of_week > 6:
        raise ValidationError("dayOfWeek must be 0-6")
    if body.start_time >= body.end_time:
        raise ValidationError("startTime must be before endTime")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    counselor_uuid = (
        parse_uuid_or_raise(body.counselor_id, field="counselorId")
        if body.counselor_id
        else parse_uuid_or_raise(user.id, field="userId")
    )

    # 校验重叠 (service.ts:33-46)
    eq = select(CounselorAvailability).where(
        and_(
            CounselorAvailability.org_id == org_uuid,
            CounselorAvailability.counselor_id == counselor_uuid,
            CounselorAvailability.day_of_week == body.day_of_week,
        )
    )
    existing = list((await db.execute(eq)).scalars().all())
    for s in existing:
        if body.start_time < s.end_time and body.end_time > s.start_time:
            raise ConflictError(f"时段与已有排班冲突: {s.start_time}-{s.end_time}")

    slot = CounselorAvailability(
        org_id=org_uuid,
        counselor_id=counselor_uuid,
        day_of_week=body.day_of_week,
        start_time=body.start_time,
        end_time=body.end_time,
        session_type=body.session_type,
    )
    db.add(slot)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="counselor_availability",
        resource_id=str(slot.id),
    )
    return _slot_to_output(slot)


# ─── PATCH /{slot_id} ──────────────────────────────────────────


@router.patch("/{slot_id}", response_model=AvailabilityOutput)
async def update_availability(
    org_id: str,
    slot_id: str,
    body: AvailabilityUpdateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AvailabilityOutput:
    """``PATCH /{slot_id}`` (admin/counselor). 镜像 service.ts:60-113."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    slot_uuid = parse_uuid_or_raise(slot_id, field="slotId")

    q = select(CounselorAvailability).where(CounselorAvailability.id == slot_uuid).limit(1)
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing is None:
        raise NotFoundError("AvailabilitySlot", slot_id)

    new_start = body.start_time if body.start_time is not None else existing.start_time
    new_end = body.end_time if body.end_time is not None else existing.end_time

    if new_start >= new_end:
        raise ValidationError("startTime must be before endTime")

    # 校验重叠 (service.ts:81-98)
    if body.start_time is not None or body.end_time is not None:
        oq = select(CounselorAvailability).where(
            and_(
                CounselorAvailability.org_id == existing.org_id,
                CounselorAvailability.counselor_id == existing.counselor_id,
                CounselorAvailability.day_of_week == existing.day_of_week,
                CounselorAvailability.id != slot_uuid,
            )
        )
        others = list((await db.execute(oq)).scalars().all())
        for s in others:
            if new_start < s.end_time and new_end > s.start_time:
                raise ConflictError(f"时段与已有排班冲突: {s.start_time}-{s.end_time}")

    if body.start_time is not None:
        existing.start_time = body.start_time
    if body.end_time is not None:
        existing.end_time = body.end_time
    if body.session_type is not None:
        existing.session_type = cast("Any", body.session_type)
    if body.is_active is not None:
        existing.is_active = body.is_active

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="counselor_availability",
        resource_id=slot_id,
    )
    return _slot_to_output(existing)


# ─── DELETE /{slot_id} ─────────────────────────────────────────


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_availability(
    org_id: str,
    slot_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """``DELETE /{slot_id}`` (admin/counselor). 镜像 routes.ts:86-93 + service.ts:115-123."""
    _reject_client(org)
    _require_admin_or_counselor(org)
    slot_uuid = parse_uuid_or_raise(slot_id, field="slotId")

    q = select(CounselorAvailability).where(CounselorAvailability.id == slot_uuid).limit(1)
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing is None:
        raise NotFoundError("AvailabilitySlot", slot_id)

    await db.execute(delete(CounselorAvailability).where(CounselorAvailability.id == slot_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="counselor_availability",
        resource_id=slot_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
