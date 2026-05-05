"""
Session note router — 镜像 ``server/src/modules/counseling/session-note.routes.ts`` (121 行)。

挂在 ``/api/orgs/{org_id}/session-notes`` prefix。

⚠⚠⚠ PHI 核心模块 — session_notes 是 ``phi_full`` 级别 (含 subjective / objective /
    assessment 等临床记录)。

4 个 endpoint:

  GET    /                           — 列表 (filters: counselorId / clientId / careEpisodeId)
  GET    /{note_id}                  — 详情 (PHI access log!)
  POST   /                           — 创建 (admin/counselor) + (可选) 写 timeline
  PATCH  /{note_id}                  — 部分更新 (PHI access log!)

PHI 接通点位:
  - GET /{note_id} → ``record_phi_access(action='view', resource='session_notes')``
  - PATCH /{note_id} → ``record_phi_access(action='view', resource='session_notes')``
    (镜像 routes.ts:108-114, edit 也是 phi_full 操作)

RBAC 守门:
  - 所有 GET 需 OrgContext
  - POST / PATCH 需 admin/counselor

Status 状态机 (DB 端):
  draft → finalized → submitted_for_review → reviewed (督导审签流)
  目前 Node 路由层只 expose CRUD (status 更新走 PATCH 同字段), Phase X 督导
  专属端点暂未拆。

Note format 4 类:
  soap (内置 4 列 subjective/objective/assessment/plan)
  dap / birp / custom (走 fields JSONB)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    SessionNoteCreateRequest,
    SessionNoteOutput,
    SessionNoteUpdateRequest,
)
from app.core.database import get_db
from app.db.models.care_timeline import CareTimeline
from app.db.models.session_notes import SessionNote
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.phi_access import record_phi_access
from app.middleware.role_guards import require_admin_or_counselor as _require_admin_or_counselor

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _note_to_output(n: SessionNote) -> SessionNoteOutput:
    return SessionNoteOutput(
        id=str(n.id),
        org_id=str(n.org_id),
        care_episode_id=str(n.care_episode_id) if n.care_episode_id else None,
        appointment_id=str(n.appointment_id) if n.appointment_id else None,
        client_id=str(n.client_id),
        counselor_id=str(n.counselor_id),
        note_format=n.note_format or "soap",
        template_id=str(n.template_id) if n.template_id else None,
        session_date=n.session_date,
        duration=n.duration,
        session_type=n.session_type,
        subjective=n.subjective,
        objective=n.objective,
        assessment=n.assessment,
        plan=n.plan,
        fields=n.fields or {},
        summary=n.summary,
        tags=list(n.tags) if n.tags else [],
        status=n.status or "draft",
        supervisor_annotation=n.supervisor_annotation,
        submitted_for_review_at=n.submitted_for_review_at,
        created_at=getattr(n, "created_at", None),
        updated_at=getattr(n, "updated_at", None),
    )


_FORMAT_LABELS: dict[str, str] = {
    "soap": "SOAP",
    "dap": "DAP",
    "birp": "BIRP",
    "custom": "自定义",
}


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[SessionNoteOutput])
async def list_session_notes(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Annotated[str | None, Query(alias="counselorId")] = None,
    client_id: Annotated[str | None, Query(alias="clientId")] = None,
    care_episode_id: Annotated[str | None, Query(alias="careEpisodeId")] = None,
) -> list[SessionNoteOutput]:
    """``GET /`` 列表 (镜像 routes.ts:18-24 + service.ts:8-23)。

    注意: 列表只返回 metadata (含 subjective 等 PHI 内容) — 但因为 Node
    端 service.ts:18-23 直接 select * 也包含全字段, 这里行为对齐。
    严格 PHI 隔离应在 Phase X 加 list-mode 字段过滤 (只返 id/clientId/sessionDate)。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [SessionNote.org_id == org_uuid]
    if counselor_id:
        conds.append(
            SessionNote.counselor_id == parse_uuid_or_raise(counselor_id, field="counselorId")
        )
    if client_id:
        conds.append(SessionNote.client_id == parse_uuid_or_raise(client_id, field="clientId"))
    if care_episode_id:
        conds.append(
            SessionNote.care_episode_id
            == parse_uuid_or_raise(care_episode_id, field="careEpisodeId")
        )

    q = select(SessionNote).where(and_(*conds)).order_by(desc(SessionNote.session_date))
    rows = list((await db.execute(q)).scalars().all())
    return [_note_to_output(n) for n in rows]


# ─── GET /{note_id} 详情 (PHI access log!) ─────────────────────


@router.get("/{note_id}", response_model=SessionNoteOutput)
async def get_session_note(
    org_id: str,
    note_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionNoteOutput:
    """``GET /{note_id}`` 详情 (镜像 routes.ts:27-41 + service.ts:25-34).

    ⚠ PHI access log: session_notes 是 phi_full, clinic_admin 默认禁读。
    必须 ``record_phi_access(action='view')``。
    """
    _require_org(org)
    note_uuid = parse_uuid_or_raise(note_id, field="noteId")

    q = select(SessionNote).where(SessionNote.id == note_uuid).limit(1)
    note = (await db.execute(q)).scalar_one_or_none()
    if note is None:
        raise NotFoundError("SessionNote", note_id)

    # PHI access log (镜像 routes.ts:39)
    await record_phi_access(
        db=db,
        org_id=org_id if org else "",
        user_id=user.id,
        client_id=str(note.client_id),
        resource="session_notes",
        action="view",
        resource_id=note_id,
        data_class="phi_full",
        actor_role_snapshot=org.role_v2 if org else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _note_to_output(note)


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=SessionNoteOutput, status_code=status.HTTP_201_CREATED)
async def create_session_note(
    org_id: str,
    body: SessionNoteCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionNoteOutput:
    """``POST /`` 创建 (admin/counselor). 镜像 routes.ts:44-90 + service.ts:49-116.

    Multi-format: soap 走专列, dap/birp/custom 走 fields JSONB.
    Transactional: note + (可选) timeline 单 commit.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    care_uuid = (
        parse_uuid_or_raise(body.care_episode_id, field="careEpisodeId")
        if body.care_episode_id
        else None
    )
    appt_uuid = (
        parse_uuid_or_raise(body.appointment_id, field="appointmentId")
        if body.appointment_id
        else None
    )
    template_uuid = (
        parse_uuid_or_raise(body.template_id, field="templateId") if body.template_id else None
    )
    fmt = body.note_format or "soap"

    try:
        note = SessionNote(
            org_id=org_uuid,
            care_episode_id=care_uuid,
            appointment_id=appt_uuid,
            client_id=client_uuid,
            counselor_id=user_uuid,
            note_format=fmt,
            template_id=template_uuid,
            session_date=body.session_date,
            duration=body.duration,
            session_type=body.session_type,
            subjective=body.subjective if fmt == "soap" else None,
            objective=body.objective if fmt == "soap" else None,
            assessment=body.assessment if fmt == "soap" else None,
            plan=body.plan if fmt == "soap" else None,
            fields=body.fields or {} if fmt != "soap" else {},
            summary=body.summary,
            tags=body.tags or [],
        )
        db.add(note)
        await db.flush()  # 拿 note.id

        if care_uuid:
            label = _FORMAT_LABELS.get(fmt, fmt)
            db.add(
                CareTimeline(
                    care_episode_id=care_uuid,
                    event_type="session_note",
                    ref_id=note.id,
                    title=f"咨询记录 ({label})",
                    summary=body.summary or f"{body.session_date} {body.session_type or '咨询'}",
                    metadata_={
                        "duration": body.duration,
                        "sessionType": body.session_type,
                        "noteFormat": fmt,
                    },
                    created_by=user_uuid,
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
        resource="session_notes",
        resource_id=str(note.id),
        ip_address=request.client.host if request.client else None,
    )
    return _note_to_output(note)


# ─── PATCH /{note_id} 部分更新 (PHI access log) ───────────────


@router.patch("/{note_id}", response_model=SessionNoteOutput)
async def update_session_note(
    org_id: str,
    note_id: str,
    body: SessionNoteUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionNoteOutput:
    """``PATCH /{note_id}`` (admin/counselor). 镜像 routes.ts:93-119 + service.ts:118-138.

    ⚠ PHI access log: edit 也是 phi_full 操作 (镜像 routes.ts:108-114)。
    先 SELECT 拿到 ownerUserId 再走 access log。多 1 个 SELECT 是合规代价。
    """
    _require_admin_or_counselor(org)
    note_uuid = parse_uuid_or_raise(note_id, field="noteId")

    q = select(SessionNote).where(SessionNote.id == note_uuid).limit(1)
    note = (await db.execute(q)).scalar_one_or_none()
    if note is None:
        raise NotFoundError("SessionNote", note_id)

    # PHI access log — 写操作也算 PHI 触达 (镜像 routes.ts:108-114)
    await record_phi_access(
        db=db,
        org_id=org_id if org else "",
        user_id=user.id,
        client_id=str(note.client_id),
        resource="session_notes",
        action="view",  # Node 端用 'edit' action 但 PhiAction 仅有 view/export/print/share
        resource_id=note_id,
        data_class="phi_full",
        actor_role_snapshot=org.role_v2 if org else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    updates = body.model_dump(exclude_unset=True, by_alias=False)
    for field_name, value in updates.items():
        setattr(note, field_name, value)
    note.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="session_notes",
        resource_id=note_id,
        ip_address=request.client.host if request.client else None,
    )
    return _note_to_output(note)


__all__ = ["router"]
