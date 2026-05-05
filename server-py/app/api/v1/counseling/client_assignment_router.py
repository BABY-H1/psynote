"""
Client assignment router — 镜像 ``server/src/modules/counseling/client-assignment.routes.ts`` (42 行)。

挂在 ``/api/orgs/{org_id}/client-assignments`` prefix。

3 个 endpoint:

  GET    /                    — 列表 (counselor 看自己, admin 看全部)
  POST   /                    — 创建 (admin/counselor)
  DELETE /{assignment_id}     — 删除 (admin only)

⚠ RBAC 核心: client_assignments 决定咨询师能看到哪些客户 — 是 ``data_scope.py``
``allowed_client_ids`` 的来源之一 (Phase 2 ORM 接通后, data_scope 从这里 select)。
本 router 改动这表 = 改动 RBAC 实际生效范围。

字段:
  - is_primary: 一个客户可多咨询师 (主咨询 + 实习生 + 督导), 标主负责人
  - 唯一约束: 同 (org, client, counselor) 不能重复 — service.ts 里用
    ``onConflictDoNothing`` 处理重复 (返 None)
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    ClientAssignmentCreateRequest,
    ClientAssignmentOutput,
)
from app.core.database import get_db
from app.db.models.client_assignments import ClientAssignment
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# ─── 工具 ─────────────────────────────────────────────────────────


def _require_admin_or_counselor(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("org_admin", "counselor"):
        raise ForbiddenError("insufficient_role")
    return org


def _require_admin(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return org


def _require_org(org: OrgContext | None) -> OrgContext:
    if org is None:
        raise ForbiddenError("org_context_required")
    return org


def _assignment_to_output(a: ClientAssignment) -> ClientAssignmentOutput:
    return ClientAssignmentOutput(
        id=str(a.id),
        org_id=str(a.org_id),
        client_id=str(a.client_id),
        counselor_id=str(a.counselor_id),
        is_primary=bool(a.is_primary),
        created_at=getattr(a, "created_at", None),
    )


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[ClientAssignmentOutput])
async def list_assignments(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ClientAssignmentOutput]:
    """``GET /`` 列表 (镜像 routes.ts:13-17 + service.ts:5-9).

    counselor 仅看自己分到的, admin 看全部。
    """
    _require_org(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [ClientAssignment.org_id == org_uuid]
    if org and org.role != "org_admin":
        # counselor / 其他 → 仅自己
        user_uuid = parse_uuid_or_raise(user.id, field="userId")
        conds.append(ClientAssignment.counselor_id == user_uuid)

    q = select(ClientAssignment).where(and_(*conds))
    rows = list((await db.execute(q)).scalars().all())
    return [_assignment_to_output(a) for a in rows]


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=ClientAssignmentOutput, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    org_id: str,
    body: ClientAssignmentCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientAssignmentOutput:
    """``POST /`` (admin/counselor). 镜像 routes.ts:20-32 + service.ts:11-21.

    onConflictDoNothing 等价: 重复 (org+client+counselor) 直接返已存在那条。
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    counselor_uuid = (
        parse_uuid_or_raise(body.counselor_id, field="counselorId")
        if body.counselor_id
        else parse_uuid_or_raise(user.id, field="userId")
    )

    # 重复检查 (Drizzle onConflictDoNothing 等价)
    dup_q = (
        select(ClientAssignment)
        .where(
            and_(
                ClientAssignment.org_id == org_uuid,
                ClientAssignment.client_id == client_uuid,
                ClientAssignment.counselor_id == counselor_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(dup_q)).scalar_one_or_none()
    if existing is not None:
        return _assignment_to_output(existing)

    assignment = ClientAssignment(
        org_id=org_uuid,
        client_id=client_uuid,
        counselor_id=counselor_uuid,
        is_primary=body.is_primary if body.is_primary is not None else True,
    )
    db.add(assignment)
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
        resource="client_assignments",
        resource_id=str(assignment.id),
    )
    return _assignment_to_output(assignment)


# ─── DELETE /{assignment_id} ──────────────────────────────────


@router.delete("/{assignment_id}", response_model=ClientAssignmentOutput)
async def delete_assignment(
    org_id: str,
    assignment_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientAssignmentOutput:
    """``DELETE /{assignment_id}`` (admin only). 镜像 routes.ts:35-41 + service.ts:23-26."""
    _require_admin(org)
    assignment_uuid = parse_uuid_or_raise(assignment_id, field="assignmentId")

    q = select(ClientAssignment).where(ClientAssignment.id == assignment_uuid).limit(1)
    assignment = (await db.execute(q)).scalar_one_or_none()
    if assignment is None:
        raise NotFoundError("ClientAssignment", assignment_id)

    output = _assignment_to_output(assignment)
    await db.execute(delete(ClientAssignment).where(ClientAssignment.id == assignment_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="client_assignments",
        resource_id=assignment_id,
    )
    return output


__all__ = ["router"]
