"""
Collaboration 路由 — 镜像 ``server/src/modules/collaboration/collaboration.routes.ts`` (239 行)。

挂在 ``/api/orgs/{org_id}/collaboration`` prefix 下:

  Tab A:
    GET   /unassigned-clients              — 未分派 client member 列表 (org_admin only)
    GET   /assignments                     — 派单历史 (org_admin / counselor)

  Tab C:
    GET   /pending-notes                   — 督导待审 notes (filter by supervisee)
    POST  /pending-notes/{note_id}/review  — 督导审签 (approve / reject)

  Audit (org_admin only):
    GET   /audit                           — audit_logs 查询
    GET   /phi-access                      — phi_access_logs 查询

业务设计 (与 Node 一致):
  - 此路由是 collaboration UI 的 "ONE prefix" 入口; cross-domain query 在这里
    集中, 而非反向耦合到 client_assignment / session_note 模块。
  - rejectClient (org.role != client) 自动适用于全部端点。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.collaboration.schemas import (
    AssignmentRow,
    AuditLogRow,
    PendingNoteRow,
    PHIAccessLogRow,
    ReviewNoteRequest,
    ReviewNoteResult,
    UnassignedClientRow,
)
from app.core.database import get_db
from app.db.models.audit_logs import AuditLog
from app.db.models.phi_access_logs import PHIAccessLog
from app.db.models.session_notes import SessionNote
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import (
    reject_client,
    require_admin,
    require_admin_or_counselor,
)

router = APIRouter()


# ─── Guards ─────────────────────────────────────────────────────


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _reject_client(org: OrgContext) -> None:
    reject_client(org, client_message="client_role_not_allowed")


def _require_org_admin(org: OrgContext) -> None:
    require_admin(org, insufficient_message="This action requires the role: org_admin")


def _require_admin_or_counselor(org: OrgContext) -> None:
    require_admin_or_counselor(
        org,
        insufficient_message="This action requires one of the following roles: org_admin, counselor",
    )


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


# ─── Tab A: Unassigned clients ───────────────────────────────


@router.get("/unassigned-clients", response_model=list[UnassignedClientRow])
async def list_unassigned_clients(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> list[UnassignedClientRow]:
    """没分派的 client member 列表 (镜像 routes.ts:46-68)。

    org_admin only — 派单 dashboard 的左侧 "待派单" 区。
    """
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_org_admin(org_ctx)
    parse_uuid_or_raise(org_id, field="orgId")

    sql = text(
        """
        SELECT
            u.id::text          AS id,
            u.name              AS name,
            u.email             AS email,
            om.created_at       AS joined_at
        FROM org_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.org_id = :org_id::uuid
          AND om.role = 'client'
          AND om.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM client_assignments ca
              WHERE ca.org_id = :org_id::uuid
                AND ca.client_id = u.id
          )
        ORDER BY om.created_at DESC
        """
    )
    rows = list((await db.execute(sql, {"org_id": org_id})).mappings().all())
    return [
        UnassignedClientRow(
            id=str(r["id"]),
            name=str(r["name"]) if r.get("name") else None,
            email=str(r["email"]) if r.get("email") else None,
            joined_at=_iso(r.get("joined_at")),
        )
        for r in rows
    ]


@router.get("/assignments", response_model=list[AssignmentRow])
async def list_assignments(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> list[AssignmentRow]:
    """已派单历史 (镜像 routes.ts:75-93). org_admin / counselor."""
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_admin_or_counselor(org_ctx)
    parse_uuid_or_raise(org_id, field="orgId")

    sql = text(
        """
        SELECT
            ca.id::text            AS id,
            ca.client_id::text     AS client_id,
            ca.counselor_id::text  AS counselor_id,
            ca.is_primary          AS is_primary,
            ca.created_at          AS assigned_at,
            client.name            AS client_name,
            counselor.name         AS counselor_name
        FROM client_assignments ca
        JOIN users client ON client.id = ca.client_id
        JOIN users counselor ON counselor.id = ca.counselor_id
        WHERE ca.org_id = :org_id::uuid
        ORDER BY ca.created_at DESC
        """
    )
    rows = list((await db.execute(sql, {"org_id": org_id})).mappings().all())
    return [
        AssignmentRow(
            id=str(r["id"]),
            client_id=str(r["client_id"]),
            counselor_id=str(r["counselor_id"]),
            is_primary=bool(r["is_primary"]),
            assigned_at=_iso(r.get("assigned_at")),
            client_name=str(r["client_name"]) if r.get("client_name") else None,
            counselor_name=str(r["counselor_name"]) if r.get("counselor_name") else None,
        )
        for r in rows
    ]


# ─── Tab C: Pending notes for supervision ────────────────────


@router.get("/pending-notes", response_model=list[PendingNoteRow])
async def list_pending_notes(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> list[PendingNoteRow]:
    """督导待审 notes (镜像 routes.ts:106-139).

    - org_admin → 全部待审 notes
    - 非 admin (counselor 督导身份) → 仅自己的 supervisees 提交的 notes
    """
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_admin_or_counselor(org_ctx)
    parse_uuid_or_raise(org_id, field="orgId")
    parse_uuid_or_raise(user.id, field="userId")

    is_admin = org_ctx.role == "org_admin"

    if is_admin:
        sql = text(
            """
            SELECT
                sn.id::text                  AS id,
                sn.client_id::text           AS client_id,
                sn.counselor_id::text        AS counselor_id,
                sn.session_date              AS session_date,
                sn.note_format               AS note_format,
                sn.status                    AS status,
                sn.submitted_for_review_at   AS submitted_for_review_at,
                sn.summary                   AS summary,
                client.name                  AS client_name,
                counselor.name               AS counselor_name
            FROM session_notes sn
            JOIN users client    ON client.id    = sn.client_id
            JOIN users counselor ON counselor.id = sn.counselor_id
            WHERE sn.org_id = :org_id::uuid
              AND sn.status = 'submitted_for_review'
            ORDER BY sn.submitted_for_review_at DESC
            """
        )
        params: dict[str, Any] = {"org_id": org_id}
    else:
        # 仅看 supervisees 的 — 走 supervisor_id 等于当前 user
        sql = text(
            """
            SELECT
                sn.id::text                  AS id,
                sn.client_id::text           AS client_id,
                sn.counselor_id::text        AS counselor_id,
                sn.session_date              AS session_date,
                sn.note_format               AS note_format,
                sn.status                    AS status,
                sn.submitted_for_review_at   AS submitted_for_review_at,
                sn.summary                   AS summary,
                client.name                  AS client_name,
                counselor.name               AS counselor_name
            FROM session_notes sn
            JOIN users client    ON client.id    = sn.client_id
            JOIN users counselor ON counselor.id = sn.counselor_id
            WHERE sn.org_id = :org_id::uuid
              AND sn.status = 'submitted_for_review'
              AND sn.counselor_id IN (
                  SELECT om.user_id FROM org_members om
                  WHERE om.org_id = :org_id::uuid
                    AND om.supervisor_id = :user_id::uuid
              )
            ORDER BY sn.submitted_for_review_at DESC
            """
        )
        params = {"org_id": org_id, "user_id": user.id}

    rows = list((await db.execute(sql, params)).mappings().all())
    return [
        PendingNoteRow(
            id=str(r["id"]),
            client_id=str(r["client_id"]),
            counselor_id=str(r["counselor_id"]),
            session_date=_iso(r.get("session_date")),
            note_format=str(r["note_format"]),
            status=str(r["status"]),
            submitted_for_review_at=_iso(r.get("submitted_for_review_at")),
            summary=str(r["summary"]) if r.get("summary") else None,
            client_name=str(r["client_name"]) if r.get("client_name") else None,
            counselor_name=str(r["counselor_name"]) if r.get("counselor_name") else None,
        )
        for r in rows
    ]


@router.post("/pending-notes/{note_id}/review", response_model=ReviewNoteResult)
async def review_pending_note(
    org_id: str,
    note_id: str,
    body: ReviewNoteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> ReviewNoteResult:
    """督导审签 (镜像 routes.ts:147-169).

    - decision='approve' → status='reviewed'
    - decision='reject'  → status='draft' + annotation
    """
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_admin_or_counselor(org_ctx)
    parse_uuid_or_raise(org_id, field="orgId")

    if body.decision not in ("approve", "reject"):
        raise ValidationError("decision must be approve or reject")

    note_uuid = parse_uuid_or_raise(note_id, field="noteId")
    q = select(SessionNote).where(SessionNote.id == note_uuid).limit(1)
    note = (await db.execute(q)).scalar_one_or_none()
    if note is None:
        # Node 端是 ValidationError("Note not found"), 但语义其实是 404 — 沿用 Node
        raise ValidationError("Note not found")

    new_status = "reviewed" if body.decision == "approve" else "draft"
    note.status = new_status
    note.supervisor_annotation = body.annotation
    note.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(note)

    return ReviewNoteResult(
        id=str(note.id),
        org_id=str(note.org_id),
        care_episode_id=str(note.care_episode_id) if note.care_episode_id else None,
        appointment_id=str(note.appointment_id) if note.appointment_id else None,
        client_id=str(note.client_id),
        counselor_id=str(note.counselor_id),
        note_format=note.note_format,
        template_id=str(note.template_id) if note.template_id else None,
        session_date=_iso(note.session_date),
        duration=note.duration,
        session_type=note.session_type,
        subjective=note.subjective,
        objective=note.objective,
        assessment=note.assessment,
        plan=note.plan,
        fields=note.fields or {},
        summary=note.summary,
        tags=list(note.tags or []),
        status=note.status,
        supervisor_annotation=note.supervisor_annotation,
        submitted_for_review_at=_iso(note.submitted_for_review_at),
    )


# ─── Audit query ─────────────────────────────────────────────


def _parse_iso_dt(v: str | None) -> datetime | None:
    """ISO8601 → datetime, 失败时 None (与 Node ``new Date(...)`` 失败放行 一致)."""
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def _clamp_limit(v: str | None, default: int = 100, *, lo: int = 1, hi: int = 500) -> int:
    """``Math.min(Math.max(parseInt(v ?? '100'), 1), 500)`` 等价 (Node routes.ts:198)."""
    try:
        n = int(v) if v else default
    except ValueError:
        n = default
    return max(lo, min(hi, n))


@router.get("/audit", response_model=list[AuditLogRow])
async def list_audit(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    user_id: Annotated[str | None, Query(alias="userId")] = None,
    resource: Annotated[str | None, Query(alias="resource")] = None,
    action: Annotated[str | None, Query(alias="action")] = None,
    since: Annotated[str | None, Query(alias="since")] = None,
    until: Annotated[str | None, Query(alias="until")] = None,
    limit: Annotated[str | None, Query(alias="limit")] = None,
) -> list[AuditLogRow]:
    """``GET /audit`` — audit_logs 查询 (镜像 routes.ts:178-206). org_admin only."""
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_org_admin(org_ctx)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [AuditLog.org_id == org_uuid]
    if user_id:
        conds.append(AuditLog.user_id == parse_uuid_or_raise(user_id, field="userId"))
    if resource:
        conds.append(AuditLog.resource == resource)
    if action:
        conds.append(AuditLog.action == action)
    since_dt = _parse_iso_dt(since)
    if since_dt:
        conds.append(AuditLog.created_at >= since_dt)
    until_dt = _parse_iso_dt(until)
    if until_dt:
        conds.append(AuditLog.created_at <= until_dt)

    cap = _clamp_limit(limit)
    q = select(AuditLog).where(and_(*conds)).order_by(desc(AuditLog.created_at)).limit(cap)
    rows = list((await db.execute(q)).scalars().all())
    return [
        AuditLogRow(
            id=str(r.id),
            org_id=str(r.org_id) if r.org_id else None,
            user_id=str(r.user_id) if r.user_id else None,
            action=r.action,
            resource=r.resource,
            resource_id=str(r.resource_id) if r.resource_id else None,
            changes=r.changes,
            ip_address=r.ip_address,
            created_at=_iso(getattr(r, "created_at", None)),
        )
        for r in rows
    ]


@router.get("/phi-access", response_model=list[PHIAccessLogRow])
async def list_phi_access(
    org_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    user_id: Annotated[str | None, Query(alias="userId")] = None,
    client_id: Annotated[str | None, Query(alias="clientId")] = None,
    since: Annotated[str | None, Query(alias="since")] = None,
    until: Annotated[str | None, Query(alias="until")] = None,
    limit: Annotated[str | None, Query(alias="limit")] = None,
) -> list[PHIAccessLogRow]:
    """``GET /phi-access`` — phi_access_logs 查询 (镜像 routes.ts:212-238). org_admin only."""
    org_ctx = _require_org(org)
    _reject_client(org_ctx)
    _require_org_admin(org_ctx)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [PHIAccessLog.org_id == org_uuid]
    if user_id:
        conds.append(PHIAccessLog.user_id == parse_uuid_or_raise(user_id, field="userId"))
    if client_id:
        conds.append(PHIAccessLog.client_id == parse_uuid_or_raise(client_id, field="clientId"))
    since_dt = _parse_iso_dt(since)
    if since_dt:
        conds.append(PHIAccessLog.created_at >= since_dt)
    until_dt = _parse_iso_dt(until)
    if until_dt:
        conds.append(PHIAccessLog.created_at <= until_dt)

    cap = _clamp_limit(limit)
    q = select(PHIAccessLog).where(and_(*conds)).order_by(desc(PHIAccessLog.created_at)).limit(cap)
    rows = list((await db.execute(q)).scalars().all())
    return [
        PHIAccessLogRow(
            id=str(r.id),
            org_id=str(r.org_id),
            user_id=str(r.user_id),
            client_id=str(r.client_id),
            resource=r.resource,
            resource_id=str(r.resource_id) if r.resource_id else None,
            action=r.action,
            reason=r.reason,
            data_class=r.data_class,
            actor_role_snapshot=r.actor_role_snapshot,
            ip_address=r.ip_address,
            user_agent=r.user_agent,
            created_at=_iso(getattr(r, "created_at", None)),
        )
        for r in rows
    ]


# 防 mypy / ruff 提示 NotFoundError 未使用 (review 端点用 ValidationError, NotFoundError
# 留作 future 升级 endpoint contract — 与 client_access_grant 同 pattern)
_ = NotFoundError


__all__ = ["router"]
