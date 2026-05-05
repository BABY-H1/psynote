"""
Group scheme router — 镜像 ``server/src/modules/group/scheme.routes.ts`` (61 行)
+ ``scheme.service.ts`` (195 行).

挂在 ``/api/orgs/{org_id}/group/schemes`` prefix. 5 endpoints:

  GET    /                  — 列表 (本人 personal + 本 org organization + public)
  GET    /:scheme_id        — 单条 + sessions
  POST   /                  — 创建 (org_admin / counselor)
  PATCH  /:scheme_id        — 更新, 含 sessions 全量替换 (org_admin / counselor)
  DELETE /:scheme_id        — 删除 (org_admin only)

RBAC 守门:
  - ``rejectClient`` (legacy role 'client' 拒绝)
  - ``requireRole('org_admin', 'counselor')`` 创建/编辑
  - ``requireRole('org_admin')`` 删除
  - PATCH/DELETE 还跑 ``assertLibraryItemOwnedByOrg`` (本 org 拥有 scheme 才能改/删)

Visibility 处理 (与 Node scheme.service.ts:6-19 一致):
  - ``visibility='public'`` 全平台可见
  - ``visibility='organization'`` 限本 org
  - ``visibility='personal'`` 仅 created_by 本人
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, asc, delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.group.schemas import (
    SchemeCreateRequest,
    SchemeRow,
    SchemeSessionInput,
    SchemeSessionRow,
    SchemeUpdateRequest,
)
from app.core.database import get_db
from app.db.models.group_scheme_sessions import GroupSchemeSession
from app.db.models.group_schemes import GroupScheme
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── Utility ─────────────────────────────────────────────────────


def _require_org_admin(org: OrgContext | None, *, allow_roles: tuple[str, ...] = ()) -> None:
    """``requireRole('org_admin')`` 等价 (与 org/router.py 同 helper)."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "org_admin":
        return
    if org.role in allow_roles:
        return
    raise ForbiddenError("insufficient_role")


def _reject_client(org: OrgContext | None) -> None:
    """``rejectClient``: legacy role 'client' 拒绝."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")


def _scheme_session_to_row(s: GroupSchemeSession) -> SchemeSessionRow:
    return SchemeSessionRow(
        id=str(s.id),
        scheme_id=str(s.scheme_id),
        title=s.title,
        goal=s.goal,
        phases=s.phases or [],
        materials=s.materials,
        duration=s.duration,
        homework=s.homework,
        assessment_notes=s.assessment_notes,
        related_goals=s.related_goals or [],
        session_theory=s.session_theory,
        session_evaluation=s.session_evaluation,
        sort_order=s.sort_order or 0,
        related_assessments=[str(x) for x in (s.related_assessments or [])],
    )


def _scheme_to_row(scheme: GroupScheme, sessions: list[GroupSchemeSession]) -> SchemeRow:
    return SchemeRow(
        id=str(scheme.id),
        org_id=str(scheme.org_id) if scheme.org_id else None,
        title=scheme.title,
        description=scheme.description,
        theory=scheme.theory,
        overall_goal=scheme.overall_goal,
        specific_goals=[str(g) for g in (scheme.specific_goals or [])],
        target_audience=scheme.target_audience,
        age_range=scheme.age_range,
        selection_criteria=scheme.selection_criteria,
        recommended_size=scheme.recommended_size,
        total_sessions=scheme.total_sessions,
        session_duration=scheme.session_duration,
        frequency=scheme.frequency,
        facilitator_requirements=scheme.facilitator_requirements,
        evaluation_method=scheme.evaluation_method,
        notes=scheme.notes,
        recruitment_assessments=[str(x) for x in (scheme.recruitment_assessments or [])],
        overall_assessments=[str(x) for x in (scheme.overall_assessments or [])],
        screening_notes=scheme.screening_notes,
        visibility=scheme.visibility or "personal",
        created_by=str(scheme.created_by) if scheme.created_by else None,
        created_at=getattr(scheme, "created_at", None),
        updated_at=getattr(scheme, "updated_at", None),
        sessions=[_scheme_session_to_row(s) for s in sessions],
    )


async def _load_scheme_sessions(db: AsyncSession, scheme_id: uuid.UUID) -> list[GroupSchemeSession]:
    q = (
        select(GroupSchemeSession)
        .where(GroupSchemeSession.scheme_id == scheme_id)
        .order_by(asc(GroupSchemeSession.sort_order))
    )
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


def _build_session_orm_rows(
    scheme_id: uuid.UUID, sessions: list[SchemeSessionInput]
) -> list[GroupSchemeSession]:
    """从输入 sessions 构造 ORM rows (创建 / 更新共用).

    镜像 scheme.service.ts:125-142 / 162-180 的 INSERT VALUES.
    """
    out: list[GroupSchemeSession] = []
    for idx, s in enumerate(sessions):
        row = GroupSchemeSession(
            scheme_id=scheme_id,
            title=s.title,
            goal=s.goal,
            phases=s.phases or [],
            materials=s.materials,
            duration=s.duration,
            homework=s.homework,
            assessment_notes=s.assessment_notes,
            related_goals=s.related_goals or [],
            session_theory=s.session_theory,
            session_evaluation=s.session_evaluation,
            sort_order=idx if s.sort_order is None else s.sort_order,
            related_assessments=s.related_assessments or [],
        )
        out.append(row)
    return out


async def _assert_owned_by_org(
    db: AsyncSession, scheme_id: uuid.UUID, org_uuid: uuid.UUID
) -> GroupScheme:
    """``assertLibraryItemOwnedByOrg``: scheme 必须属于本 org, 否则 404.

    镜像 ``library-ownership.ts``: 不暴露 "存在但非你的" 信息, 用 404 防 enumeration.
    """
    q = select(GroupScheme).where(GroupScheme.id == scheme_id).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("GroupScheme", str(scheme_id))
    # 跨 org 也按 NotFound 处理 (与 Node library-ownership.ts 一致)
    if row.org_id is not None and str(row.org_id) != str(org_uuid):
        raise NotFoundError("GroupScheme", str(scheme_id))
    return row


# ─── Routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[SchemeRow])
async def list_schemes(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SchemeRow]:
    """列表方案 — 镜像 scheme.service.ts:6-40 listSchemes.

    可见性: public OR (orgId == 当前 org AND organization) OR (createdBy == 当前 user AND personal).
    """
    _reject_client(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    visibility_clauses: list[Any] = [
        GroupScheme.visibility == "public",
        and_(GroupScheme.org_id == org_uuid, GroupScheme.visibility == "organization"),
        and_(GroupScheme.created_by == user_uuid, GroupScheme.visibility == "personal"),
    ]
    q = select(GroupScheme).where(or_(*visibility_clauses)).order_by(desc(GroupScheme.created_at))
    schemes = list((await db.execute(q)).scalars().all())
    if not schemes:
        return []

    # 一次性把所有 sessions 拉回, 按 scheme_id 分组 (镜像 Node 端 OR(eq) 拉一次)
    scheme_ids = [s.id for s in schemes]
    sess_q = (
        select(GroupSchemeSession)
        .where(GroupSchemeSession.scheme_id.in_(scheme_ids))
        .order_by(asc(GroupSchemeSession.sort_order))
    )
    all_sessions = list((await db.execute(sess_q)).scalars().all())

    by_scheme: dict[uuid.UUID, list[GroupSchemeSession]] = {sid: [] for sid in scheme_ids}
    for sess in all_sessions:
        by_scheme.setdefault(sess.scheme_id, []).append(sess)

    return [_scheme_to_row(s, by_scheme.get(s.id, [])) for s in schemes]


@router.get("/{scheme_id}", response_model=SchemeRow)
async def get_scheme(
    org_id: str,
    scheme_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SchemeRow:
    """单条 scheme + sessions. 镜像 scheme.service.ts:42-58."""
    _reject_client(org)
    s_uuid = parse_uuid_or_raise(scheme_id, field="schemeId")

    q = select(GroupScheme).where(GroupScheme.id == s_uuid).limit(1)
    scheme = (await db.execute(q)).scalar_one_or_none()
    if scheme is None:
        raise NotFoundError("GroupScheme", scheme_id)

    sessions = await _load_scheme_sessions(db, s_uuid)
    return _scheme_to_row(scheme, sessions)


@router.post("/", response_model=SchemeRow, status_code=status.HTTP_201_CREATED)
async def create_scheme(
    org_id: str,
    body: SchemeCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SchemeRow:
    """创建 scheme (org_admin / counselor). 镜像 scheme.service.ts:100-146.

    Transactional: scheme + 子 sessions 一起 commit, 失败 rollback.
    """
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        scheme = GroupScheme(
            org_id=org_uuid,
            title=body.title,
            description=body.description,
            theory=body.theory,
            overall_goal=body.overall_goal,
            specific_goals=body.specific_goals or [],
            target_audience=body.target_audience,
            age_range=body.age_range,
            selection_criteria=body.selection_criteria,
            recommended_size=body.recommended_size,
            total_sessions=body.total_sessions,
            session_duration=body.session_duration,
            frequency=body.frequency,
            facilitator_requirements=body.facilitator_requirements,
            evaluation_method=body.evaluation_method,
            notes=body.notes,
            recruitment_assessments=body.recruitment_assessments or [],
            overall_assessments=body.overall_assessments or [],
            screening_notes=body.screening_notes,
            visibility=body.visibility or "personal",
            created_by=user_uuid,
        )
        db.add(scheme)
        await db.flush()  # 取 scheme.id 给 session FK

        if body.sessions:
            for srow in _build_session_orm_rows(scheme.id, body.sessions):
                db.add(srow)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    sessions = await _load_scheme_sessions(db, scheme.id)

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="group_schemes",
        resource_id=str(scheme.id),
        ip_address=request.client.host if request.client else None,
    )
    return _scheme_to_row(scheme, sessions)


@router.patch("/{scheme_id}", response_model=SchemeRow)
async def update_scheme(
    org_id: str,
    scheme_id: str,
    body: SchemeUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SchemeRow:
    """更新 scheme + (可选) sessions 全量替换. 镜像 scheme.service.ts:148-185.

    Transactional: scheme update + delete 旧 sessions + insert 新 sessions 一起 commit.
    """
    _require_org_admin(org, allow_roles=("counselor",))
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    s_uuid = parse_uuid_or_raise(scheme_id, field="schemeId")

    scheme = await _assert_owned_by_org(db, s_uuid, org_uuid)

    # 取出 sessions 字段 (与 Node ``const { sessions, ...schemeUpdates } = body`` 一致)
    sessions_input = body.sessions
    update_data = body.model_dump(exclude_unset=True, exclude={"sessions"})

    try:
        for k, v in update_data.items():
            setattr(scheme, k, v)
        scheme.updated_at = datetime.now(UTC)

        if sessions_input is not None:
            # 全量替换: 先清旧
            await db.execute(
                delete(GroupSchemeSession).where(GroupSchemeSession.scheme_id == s_uuid)
            )
            for srow in _build_session_orm_rows(s_uuid, sessions_input):
                db.add(srow)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    sessions = await _load_scheme_sessions(db, s_uuid)

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="group_schemes",
        resource_id=str(s_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return _scheme_to_row(scheme, sessions)


@router.delete("/{scheme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scheme(
    org_id: str,
    scheme_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """删除 scheme (org_admin only). 镜像 scheme.service.ts:187-195."""
    _require_org_admin(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    s_uuid = parse_uuid_or_raise(scheme_id, field="schemeId")

    await _assert_owned_by_org(db, s_uuid, org_uuid)

    await db.execute(delete(GroupScheme).where(GroupScheme.id == s_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="delete",
        resource="group_schemes",
        resource_id=str(s_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return None
