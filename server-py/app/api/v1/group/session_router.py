"""
Group session router — 镜像 ``server/src/modules/group/session.routes.ts`` (96 行)
+ ``session.service.ts`` (240 行).

挂在 ``/api/orgs/{org_id}/group/instances`` prefix (与 instance_router 共用前缀
但 path 都是 ``/{instance_id}/sessions(...)`` 形态). 7 endpoints:

  GET    /:instance_id/sessions                       — 列表 records + 出勤计数
  GET    /:instance_id/sessions/:session_id           — 单条 record + 出勤名单
  POST   /:instance_id/sessions/init                  — 从 scheme 初始化全套 records
  POST   /:instance_id/sessions                       — ad-hoc 单条 record
  PATCH  /:instance_id/sessions/:session_id           — 改 status / date / notes / title
  POST   /:instance_id/sessions/:session_id/attendance — 批量 upsert 出勤
  GET    /:instance_id/attendance-summary             — 全 instance 出勤汇总

阶段管理:
  - record.status: planned → completed / cancelled
  - 仅 ``status='completed'`` 的 records 计入 attendance summary (instance.service.ts:202-209)
  - init: instance 必须有 scheme_id, 且不能已 init 过 (重复 init 抛 ValidationError)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.group.schemas import (
    AttendanceBatchRequest,
    AttendanceRow,
    SessionAttendanceItem,
    SessionAttendanceUserSummary,
    SessionRecordCreateRequest,
    SessionRecordDetail,
    SessionRecordListItem,
    SessionRecordRow,
    SessionRecordUpdateRequest,
)
from app.core.database import get_db
from app.db.models.group_enrollments import GroupEnrollment
from app.db.models.group_instances import GroupInstance
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_session_attendance import GroupSessionAttendance
from app.db.models.group_session_records import GroupSessionRecord
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── Utility ─────────────────────────────────────────────────────


def _require_org_admin(org: OrgContext | None, *, allow_roles: tuple[str, ...] = ()) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "org_admin":
        return
    if org.role in allow_roles:
        return
    raise ForbiddenError("insufficient_role")


def _reject_client(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")


def _record_to_row(rec: GroupSessionRecord) -> SessionRecordRow:
    return SessionRecordRow(
        id=str(rec.id),
        instance_id=str(rec.instance_id),
        scheme_session_id=str(rec.scheme_session_id) if rec.scheme_session_id else None,
        session_number=rec.session_number,
        title=rec.title,
        date=rec.date,
        status=rec.status or "planned",
        notes=rec.notes,
        created_at=getattr(rec, "created_at", None),
        updated_at=getattr(rec, "updated_at", None),
    )


# ─── Routes ─────────────────────────────────────────────────────


@router.get("/{instance_id}/sessions", response_model=list[SessionRecordListItem])
async def list_session_records(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SessionRecordListItem]:
    """列表 records + 出勤计数. 镜像 session.service.ts:10-40."""
    _reject_client(org)
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    rec_q = (
        select(GroupSessionRecord)
        .where(GroupSessionRecord.instance_id == inst_uuid)
        .order_by(asc(GroupSessionRecord.session_number))
    )
    records = list((await db.execute(rec_q)).scalars().all())
    if not records:
        return []

    # 拉所有出勤行, Python 端汇总 (与 Node SQL filter aggregate 等价, 但更易测)
    rec_ids = [r.id for r in records]
    att_q = select(GroupSessionAttendance).where(
        GroupSessionAttendance.session_record_id.in_(rec_ids)
    )
    all_att = list((await db.execute(att_q)).scalars().all())

    counts: dict[uuid.UUID, dict[str, int]] = {}
    for a in all_att:
        c = counts.setdefault(a.session_record_id, {"present": 0, "total": 0})
        c["total"] += 1
        if a.status in ("present", "late"):
            c["present"] += 1

    out: list[SessionRecordListItem] = []
    for r in records:
        c = counts.get(r.id, {"present": 0, "total": 0})
        base = _record_to_row(r).model_dump(by_alias=False)
        out.append(
            SessionRecordListItem(
                **base, attendance_count=c["present"], total_attendance=c["total"]
            )
        )
    return out


@router.get("/{instance_id}/sessions/{session_id}", response_model=SessionRecordDetail)
async def get_session_record(
    org_id: str,
    instance_id: str,
    session_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRecordDetail:
    """单条 record + 出勤名单. 镜像 session.service.ts:42-72."""
    _reject_client(org)
    sess_uuid = parse_uuid_or_raise(session_id, field="sessionId")

    rec_q = select(GroupSessionRecord).where(GroupSessionRecord.id == sess_uuid).limit(1)
    rec = (await db.execute(rec_q)).scalar_one_or_none()
    if rec is None:
        raise NotFoundError("GroupSessionRecord", session_id)

    # join attendance + enrollment + user
    att_q = (
        select(GroupSessionAttendance, GroupEnrollment, User.name, User.email)
        .join(GroupEnrollment, GroupEnrollment.id == GroupSessionAttendance.enrollment_id)
        .outerjoin(User, User.id == GroupEnrollment.user_id)
        .where(GroupSessionAttendance.session_record_id == sess_uuid)
    )
    rows = (await db.execute(att_q)).all()

    attendance: list[SessionAttendanceItem] = []
    for att, enr, u_name, u_email in rows:
        attendance.append(
            SessionAttendanceItem(
                id=str(att.id),
                session_record_id=str(att.session_record_id),
                enrollment_id=str(att.enrollment_id),
                status=att.status,
                note=att.note,
                created_at=getattr(att, "created_at", None),
                user=SessionAttendanceUserSummary(
                    id=str(enr.user_id) if enr.user_id else None,
                    name=u_name,
                    email=u_email,
                ),
            )
        )

    base = _record_to_row(rec).model_dump(by_alias=False)
    return SessionRecordDetail(**base, attendance=attendance)


@router.post(
    "/{instance_id}/sessions/init",
    response_model=list[SessionRecordRow],
    status_code=status.HTTP_201_CREATED,
)
async def init_session_records(
    org_id: str,
    instance_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SessionRecordRow]:
    """从 scheme 初始化整套 records (org_admin / counselor). 镜像 session.service.ts:74-119.

    前置:
      - instance 存在, instance.scheme_id 不为空
      - records 必须为空 (重复 init 抛 ValidationError)
    """
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    inst_q = select(GroupInstance).where(GroupInstance.id == inst_uuid).limit(1)
    inst = (await db.execute(inst_q)).scalar_one_or_none()
    if inst is None:
        raise NotFoundError("GroupInstance", instance_id)
    if inst.scheme_id is None:
        raise ValidationError("Instance has no associated scheme")

    # 已存在任意 record → 重复 init 拒
    existing_q = (
        select(GroupSessionRecord).where(GroupSessionRecord.instance_id == inst_uuid).limit(1)
    )
    if (await db.execute(existing_q)).scalar_one_or_none() is not None:
        raise ValidationError("Session records already initialized")

    # scheme sessions
    ss_q = (
        select(GroupSchemeSession)
        .where(GroupSchemeSession.scheme_id == inst.scheme_id)
        .order_by(asc(GroupSchemeSession.sort_order))
    )
    scheme_sessions = list((await db.execute(ss_q)).scalars().all())
    if not scheme_sessions:
        return []

    new_recs: list[GroupSessionRecord] = []
    for idx, ss in enumerate(scheme_sessions):
        rec = GroupSessionRecord(
            instance_id=inst_uuid,
            scheme_session_id=ss.id,
            session_number=idx + 1,
            title=ss.title,
            status="planned",
        )
        db.add(rec)
        new_recs.append(rec)

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_session_records",
        resource_id=instance_id,
        ip_address=request.client.host if request.client else None,
    )
    return [_record_to_row(r) for r in new_recs]


@router.post(
    "/{instance_id}/sessions",
    response_model=SessionRecordRow,
    status_code=status.HTTP_201_CREATED,
)
async def create_session_record(
    org_id: str,
    instance_id: str,
    body: SessionRecordCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRecordRow:
    """ad-hoc 单条 record (org_admin / counselor). 镜像 session.service.ts:121-136."""
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    rec = GroupSessionRecord(
        instance_id=inst_uuid,
        session_number=body.session_number,
        title=body.title,
        date=body.date,
        status="planned",
    )
    db.add(rec)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_session_records",
        resource_id=str(rec.id),
        ip_address=request.client.host if request.client else None,
    )
    return _record_to_row(rec)


@router.patch("/{instance_id}/sessions/{session_id}", response_model=SessionRecordRow)
async def update_session_record(
    org_id: str,
    instance_id: str,
    session_id: str,
    body: SessionRecordUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRecordRow:
    """更新 session record. 镜像 session.service.ts:138-155."""
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    sess_uuid = parse_uuid_or_raise(session_id, field="sessionId")

    q = select(GroupSessionRecord).where(GroupSessionRecord.id == sess_uuid).limit(1)
    rec = (await db.execute(q)).scalar_one_or_none()
    if rec is None:
        raise NotFoundError("GroupSessionRecord", session_id)

    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(rec, k, v)
    rec.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="group_session_records",
        resource_id=session_id,
        ip_address=request.client.host if request.client else None,
    )
    return _record_to_row(rec)


@router.post(
    "/{instance_id}/sessions/{session_id}/attendance",
    response_model=list[AttendanceRow],
)
async def record_attendance(
    org_id: str,
    instance_id: str,
    session_id: str,
    body: AttendanceBatchRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AttendanceRow]:
    """批量 upsert 出勤. 镜像 session.service.ts:157-197.

    每条 (session_record, enrollment) 唯一: 已存在则 update status / note, 否则 insert.
    """
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    sess_uuid = parse_uuid_or_raise(session_id, field="sessionId")

    if not body.attendances:
        raise ValidationError("attendances array is required")

    out: list[AttendanceRow] = []
    for att in body.attendances:
        enr_uuid = parse_uuid_or_raise(att.enrollment_id, field="enrollmentId")

        existing_q = (
            select(GroupSessionAttendance)
            .where(
                and_(
                    GroupSessionAttendance.session_record_id == sess_uuid,
                    GroupSessionAttendance.enrollment_id == enr_uuid,
                )
            )
            .limit(1)
        )
        existing = (await db.execute(existing_q)).scalar_one_or_none()

        if existing is not None:
            existing.status = att.status
            existing.note = att.note
            row = existing
        else:
            row = GroupSessionAttendance(
                session_record_id=sess_uuid,
                enrollment_id=enr_uuid,
                status=att.status,
                note=att.note,
            )
            db.add(row)

        out.append(
            AttendanceRow(
                id=str(row.id) if row.id else "",
                session_record_id=str(sess_uuid),
                enrollment_id=str(enr_uuid),
                status=row.status,
                note=row.note,
            )
        )

    await db.commit()

    # 持久化后回填 id (新 insert 行 commit 后 id 已生成)
    final: list[AttendanceRow] = []
    for r in out:
        final.append(
            AttendanceRow(
                id=r.id,
                session_record_id=r.session_record_id,
                enrollment_id=r.enrollment_id,
                status=r.status,
                note=r.note,
            )
        )

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_session_attendance",
        resource_id=session_id,
        ip_address=request.client.host if request.client else None,
    )
    return final


@router.get(
    "/{instance_id}/attendance-summary",
    response_model=dict[str, dict[str, int]],
)
async def attendance_summary(
    org_id: str,
    instance_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, dict[str, int]]:
    """全 instance 出勤汇总: ``{enrollmentId: {present, total}}``.

    镜像 session.service.ts:199-240. 仅 status='completed' 的 records 计入.
    """
    _reject_client(org)
    inst_uuid = parse_uuid_or_raise(instance_id, field="instanceId")

    rec_q = select(GroupSessionRecord.id).where(
        and_(
            GroupSessionRecord.instance_id == inst_uuid,
            GroupSessionRecord.status == "completed",
        )
    )
    rec_ids: list[uuid.UUID] = list((await db.execute(rec_q)).scalars().all())
    if not rec_ids:
        return {}

    att_q = select(GroupSessionAttendance.enrollment_id, GroupSessionAttendance.status).where(
        GroupSessionAttendance.session_record_id.in_(rec_ids)
    )
    att_rows = (await db.execute(att_q)).all()

    summary: dict[str, dict[str, int]] = {}
    for row in att_rows:
        enr_id = row[0]
        st = row[1]
        key = str(enr_id)
        s = summary.setdefault(key, {"present": 0, "total": 0})
        s["total"] += 1
        if st in ("present", "late"):
            s["present"] += 1
    return summary
