"""Client portal appointments router.

镜像 ``server/src/modules/client-portal/client-appointments.routes.ts``:
  GET  /appointments           — 列出 caller 的预约 (guardian-readable)
  POST /appointment-requests   — 客户自助提预约 (guardian-blocked, ?as= 拒绝)

self_only: query 由 ``client_id == target_uuid`` 强制过滤, 来访者只能看自己。
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.client_portal.schemas import AppointmentRequestBody
from app.api.v1.client_portal.shared import reject_as_param, resolve_target_user_id
from app.core.database import get_db
from app.db.models.appointments import Appointment
from app.lib.errors import ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


def _appointment_to_dict(a: Appointment) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "orgId": str(a.org_id),
        "careEpisodeId": str(a.care_episode_id) if a.care_episode_id else None,
        "clientId": str(a.client_id),
        "counselorId": str(a.counselor_id),
        "startTime": a.start_time.isoformat() if a.start_time else None,
        "endTime": a.end_time.isoformat() if a.end_time else None,
        "status": a.status,
        "type": a.type,
        "source": a.source,
        "notes": a.notes,
    }


# ─── GET /appointments ─────────────────────────────────────────


@router.get("/appointments")
async def list_appointments(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """guardian-readable. self_only: client_id 必须 == target_uuid."""
    assert org is not None
    target_uuid = await resolve_target_user_id(request, user, org, db)
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")

    q = (
        select(Appointment)
        .where(
            and_(
                Appointment.org_id == org_uuid,
                Appointment.client_id == target_uuid,
            )
        )
        .order_by(desc(Appointment.start_time))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_appointment_to_dict(a) for a in rows]


# ─── POST /appointment-requests ────────────────────────────────


@router.post("/appointment-requests", status_code=status.HTTP_201_CREATED)
async def create_appointment_request(
    body: AppointmentRequestBody,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """guardian-blocked. self_only: client_id 写入 caller 自己, 永远不接 ?as=.

    Node 侧 ``appointmentService.createClientRequest`` 是机构通用 service, 这里
    内联简化版 — pending 状态, source='client_self_book', 与 Node 行为对齐。
    """
    reject_as_param(request, user)
    assert org is not None
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    counselor_uuid = parse_uuid_or_raise(body.counselor_id, field="counselorId")

    try:
        start = datetime.fromisoformat(body.start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(body.end_time.replace("Z", "+00:00"))
    except (ValueError, AttributeError) as exc:
        raise ValidationError("startTime/endTime 必须是 ISO8601 字符串") from exc

    appt = Appointment(
        org_id=org_uuid,
        client_id=user_uuid,
        counselor_id=counselor_uuid,
        start_time=start,
        end_time=end,
        type=body.type,
        notes=body.notes,
        status="pending",
        source="client_self_book",
    )
    db.add(appt)
    await db.flush()
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="appointments",
        resource_id=str(appt.id),
        ip_address=request.client.host if request.client else None,
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_appointment_to_dict(appt),
    )


__all__ = ["router"]
