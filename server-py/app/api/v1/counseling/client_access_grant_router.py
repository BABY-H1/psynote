"""
Client access grant router — 镜像 ``server/src/modules/counseling/client-access-grant.routes.ts`` (46 行)。

挂在 ``/api/orgs/{org_id}/client-access-grants`` prefix。

3 个 endpoint:

  GET    /                — 列表 (active 状态: revoked_at IS NULL; counselor 看自己, admin 看全部)
  POST   /                — 创建 (admin/counselor)
  DELETE /{grant_id}      — 撤销 (admin/counselor; 软删 set revoked_at)

业务场景:
  - A 咨询师休假, B 咨询师临时接 case → grant (granted_to=B, expires=休假结束)
  - 案例转介前的"知情阅读"授权 → granted_to=接收方
  - 督导审计需要查特定咨询记录 → 临时 grant + revoked 用毕回收

⚠ 安全: granted_to_counselor_id 决定该咨询师能临时跨过 client_assignments
  范围看到这个 client 的 PHI — 配 ``data_scope.py`` allowed_client_ids 接通
  (Phase 2 ORM 后)。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.counseling.schemas import (
    ClientAccessGrantCreateRequest,
    ClientAccessGrantOutput,
)
from app.core.database import get_db
from app.db.models.client_access_grants import ClientAccessGrant
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


def _grant_to_output(g: ClientAccessGrant) -> ClientAccessGrantOutput:
    return ClientAccessGrantOutput(
        id=str(g.id),
        org_id=str(g.org_id),
        client_id=str(g.client_id),
        granted_to_counselor_id=str(g.granted_to_counselor_id),
        granted_by=str(g.granted_by),
        reason=g.reason,
        expires_at=g.expires_at,
        revoked_at=g.revoked_at,
        created_at=getattr(g, "created_at", None),
    )


# ─── GET / 列表 ──────────────────────────────────────────────────


@router.get("/", response_model=list[ClientAccessGrantOutput])
async def list_active_grants(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ClientAccessGrantOutput]:
    """``GET /`` 列表 (镜像 routes.ts:12-18 + service.ts:5-12).

    active = revoked_at IS NULL。counselor 仅看自己被授权的。
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    conds: list[Any] = [
        ClientAccessGrant.org_id == org_uuid,
        ClientAccessGrant.revoked_at.is_(None),
    ]
    if org and org.role != "org_admin":
        user_uuid = parse_uuid_or_raise(user.id, field="userId")
        conds.append(ClientAccessGrant.granted_to_counselor_id == user_uuid)

    q = select(ClientAccessGrant).where(and_(*conds))
    rows = list((await db.execute(q)).scalars().all())
    return [_grant_to_output(g) for g in rows]


# ─── POST / 创建 ────────────────────────────────────────────────


@router.post("/", response_model=ClientAccessGrantOutput, status_code=status.HTTP_201_CREATED)
async def create_grant(
    org_id: str,
    body: ClientAccessGrantCreateRequest,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientAccessGrantOutput:
    """``POST /`` 创建 grant (admin/counselor). 镜像 routes.ts:21-36 + service.ts:14-27.

    onConflictDoNothing 等价: 同 (org+client+counselor) 已有 grant 直接返已存在那条。
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    client_uuid = parse_uuid_or_raise(body.client_id, field="clientId")
    granted_to_uuid = parse_uuid_or_raise(
        body.granted_to_counselor_id, field="grantedToCounselorId"
    )

    # 重复检查 (onConflictDoNothing 等价)
    dup_q = (
        select(ClientAccessGrant)
        .where(
            and_(
                ClientAccessGrant.org_id == org_uuid,
                ClientAccessGrant.client_id == client_uuid,
                ClientAccessGrant.granted_to_counselor_id == granted_to_uuid,
            )
        )
        .limit(1)
    )
    existing = (await db.execute(dup_q)).scalar_one_or_none()
    if existing is not None:
        return _grant_to_output(existing)

    grant = ClientAccessGrant(
        org_id=org_uuid,
        client_id=client_uuid,
        granted_to_counselor_id=granted_to_uuid,
        granted_by=user_uuid,
        reason=body.reason,
        expires_at=body.expires_at,
    )
    db.add(grant)
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
        resource="client_access_grants",
        resource_id=str(grant.id),
    )
    return _grant_to_output(grant)


# ─── DELETE /{grant_id} 撤销 (软删) ───────────────────────────


@router.delete("/{grant_id}", response_model=ClientAccessGrantOutput)
async def revoke_grant(
    org_id: str,
    grant_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClientAccessGrantOutput:
    """``DELETE /{grant_id}`` (admin/counselor). 镜像 routes.ts:39-44 + service.ts:29-35.

    软删 — 设 revoked_at = NOW(), 不真删行 (审计追溯需要)。
    """
    _require_admin_or_counselor(org)
    grant_uuid = parse_uuid_or_raise(grant_id, field="grantId")

    q = select(ClientAccessGrant).where(ClientAccessGrant.id == grant_uuid).limit(1)
    grant = (await db.execute(q)).scalar_one_or_none()
    if grant is None:
        raise NotFoundError("ClientAccessGrant", grant_id)

    grant.revoked_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="client_access_grants",
        resource_id=grant_id,
    )
    return _grant_to_output(grant)


__all__ = ["router"]
