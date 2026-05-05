"""Counselor / org_admin 管理班级家长邀请 token router.

镜像 ``server/src/modules/parent-binding/parent-binding.routes.ts``:

  GET    /            列班级 active + revoked tokens
  POST   /            生成新 token (默认 30 天过期)
  DELETE /{token_id}  撤销 token (revoked_at = now)

挂载: ``/api/orgs/{org_id}/school/classes/{class_id}/parent-invite-tokens``

Guards: get_current_user + get_org_context + counselor/org_admin role.

设计约束 (Node parent-binding.service.ts:62-93):
  - token 24 字节随机, base64url 编码 (43 字符), 全局 unique 约束 (DB)
  - **DB 直存明文 token** — 与其它一次性 token (password reset / referral 下载)
    sha256 存 hash 不同。原因: 班级 token 需公开复制粘贴到家长群 (二维码), 不是
    短期使用即作废, 所以 DB 必须能查到原值反查 valid 状态. 反向, token 仅
    在 ``users.is_guardian_account=True`` 范围生效, 滥用面有限.
  - cascade: org / class 删除 → tokens 随删
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.parent_binding.schemas import CreateClassTokenBody
from app.core.database import get_db
from app.db.models.class_parent_invite_tokens import ClassParentInviteToken
from app.db.models.school_classes import SchoolClass
from app.lib.errors import ForbiddenError, NotFoundError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()

# Node parent-binding.service.ts:79 — randomBytes(24).toString('base64url')
_TOKEN_BYTES = 24
# Phase 5 (2026-05-04) 决策: 学校班级 token 默认 30 → 365 天 (= 1 学年).
# 学校场景 token 是公开二维码贴墙 / 印通讯录, 30 天太短家长还没看到就过期;
# 365 天覆盖一学年, 班主任仍可在 [1, 365] 范围内调整。
_DEFAULT_EXPIRES_DAYS = 365


def _require_counselor_or_admin(org: OrgContext | None) -> None:
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role not in ("counselor", "org_admin"):
        raise ForbiddenError("insufficient_role")


def _token_to_dict(t: ClassParentInviteToken) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "orgId": str(t.org_id),
        "classId": str(t.class_id),
        "token": t.token,
        "createdBy": str(t.created_by) if t.created_by else None,
        "expiresAt": t.expires_at.isoformat() if t.expires_at else None,
        "revokedAt": t.revoked_at.isoformat() if t.revoked_at else None,
        "createdAt": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


# ─── GET / ─────────────────────────────────────────────────────


@router.get("/")
async def list_class_tokens(
    class_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """列出本班所有 active + revoked tokens, 倒序按 created_at."""
    _require_counselor_or_admin(org)
    assert org is not None
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    cls_uuid = parse_uuid_or_raise(class_id, field="classId")

    q = (
        select(ClassParentInviteToken)
        .where(
            and_(
                ClassParentInviteToken.org_id == org_uuid,
                ClassParentInviteToken.class_id == cls_uuid,
            )
        )
        .order_by(desc(ClassParentInviteToken.created_at))
    )
    rows = list((await db.execute(q)).scalars().all())
    return [_token_to_dict(t) for t in rows]


# ─── POST / ────────────────────────────────────────────────────


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_class_token(
    class_id: str,
    body: CreateClassTokenBody,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """生成新 token. 默认 30 天过期. 班级必须属于本 org."""
    _require_counselor_or_admin(org)
    assert org is not None
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    cls_uuid = parse_uuid_or_raise(class_id, field="classId")

    # 校验班级属本 org (防 admin 跨 org 给别人班发 token)
    cls_q = (
        select(SchoolClass.id)
        .where(and_(SchoolClass.id == cls_uuid, SchoolClass.org_id == org_uuid))
        .limit(1)
    )
    cls = (await db.execute(cls_q)).scalar_one_or_none()
    if cls is None:
        raise NotFoundError("SchoolClass", class_id)

    expires_in_days = body.expires_in_days if body.expires_in_days else _DEFAULT_EXPIRES_DAYS
    expires_at = datetime.now(UTC) + timedelta(days=expires_in_days)
    token_str = secrets.token_urlsafe(_TOKEN_BYTES)  # 24 bytes → 32 chars (base64url)

    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    row = ClassParentInviteToken(
        org_id=org_uuid,
        class_id=cls_uuid,
        token=token_str,
        created_by=user_uuid,
        expires_at=expires_at,
    )
    db.add(row)
    await db.flush()
    await db.commit()

    await record_audit(
        db=db,
        org_id=org.org_id,
        user_id=user.id,
        action="create",
        resource="class_parent_invite_tokens",
        resource_id=str(row.id),
        ip_address=request.client.host if request.client else None,
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_token_to_dict(row))


# ─── DELETE /{token_id} ────────────────────────────────────────


@router.delete("/{token_id}")
async def revoke_class_token(
    class_id: str,
    token_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """撤销 token: revoked_at = now. 不删行 (审计保留)."""
    _require_counselor_or_admin(org)
    assert org is not None
    org_uuid = parse_uuid_or_raise(org.org_id, field="orgId")
    tid_uuid = parse_uuid_or_raise(token_id, field="tokenId")
    _ = class_id  # 路径用; service 端按 id + org_id 校验, 不强制再校 class 一致

    q = (
        select(ClassParentInviteToken)
        .where(
            and_(
                ClassParentInviteToken.id == tid_uuid,
                ClassParentInviteToken.org_id == org_uuid,
            )
        )
        .limit(1)
    )
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("ClassParentInviteToken", token_id)

    row.revoked_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=org.org_id,
        user_id=user.id,
        action="update",
        resource="class_parent_invite_tokens",
        resource_id=token_id,
        ip_address=request.client.host if request.client else None,
    )
    return _token_to_dict(row)


__all__ = ["router"]
