"""
User API router — 镜像 ``server/src/modules/user/user.routes.ts``。

2 个 endpoint (挂在 ``/api/users`` prefix, 与 Node ``app.ts:149`` 一致):
  GET   /me   — 当前 user + 最近 active org_member 摘要 (一次请求填满"咨询师档案" tab)
  PATCH /me   — 改自己的 name / avatar_url (email 不可改; 角色 / 系统管理员不可自改)

权限: 整个 router 走 ``Depends(get_current_user)``, 镜像 Node
``app.addHook('preHandler', authGuard)`` 行为 (user.routes.ts:20)。

设计选择:
  - PATCH /me 用 ``request.json()`` 取原始 body 而非 Pydantic optional fields:
    Node 端区分 "name 字段没给" / "name=null" / "name=''", PatchMeRequest 也能
    分这三态 (None / None / "") 但要让 router 拿到 raw dict 才能严格保 Node
    "至少一个字段必须给" 的语义 (光 PatchMeRequest()都过 schema 校验, 没法判
    "全没给"). 所以 router 自己再走一次原始 body 校验, schema 仅为文档与 mypy。
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.user.schemas import (
    MeMember,
    MeResponse,
    MeUser,
    PatchMeResponse,
)
from app.core.database import get_db
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import ValidationError
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()


# ─── GET /me ────────────────────────────────────────────────


@router.get("/me", response_model=MeResponse)
async def get_me(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
    """
    返回 caller 自己 user + 最新创建的 active org_member 行 (镜像 user.routes.ts:27-67)。

    - user 不存在 → 400 "用户不存在" (与 Node ValidationError 一致, 不用 404 是因为
      auth guard 已经验过 token, 走到这里 user 应当存在; 真不存在视为状态异常)
    - 没有 active org_member → ``member: null`` (legacy 单 org 多账号 / 邀请未接受)
    """
    try:
        user_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("用户不存在") from exc

    user_q = select(User).where(User.id == user_uuid).limit(1)
    db_user = (await db.execute(user_q)).scalar_one_or_none()
    if db_user is None:
        raise ValidationError("用户不存在")

    # 最近一条 active org_member + LEFT JOIN organizations.name
    member_q = (
        select(OrgMember, Organization.name.label("org_name"))
        .outerjoin(Organization, Organization.id == OrgMember.org_id)
        .where(OrgMember.user_id == user_uuid, OrgMember.status == "active")
        .order_by(desc(OrgMember.created_at))
        .limit(1)
    )
    member_row = (await db.execute(member_q)).first()

    me_user = MeUser(
        id=str(db_user.id),
        email=db_user.email,
        name=db_user.name,
        avatar_url=db_user.avatar_url,
        is_system_admin=db_user.is_system_admin,
        is_guardian_account=db_user.is_guardian_account,
        created_at=db_user.created_at,
    )

    me_member: MeMember | None = None
    if member_row is not None:
        m: OrgMember = member_row[0]
        org_name: str | None = member_row[1]
        me_member = MeMember(
            id=str(m.id),
            org_id=str(m.org_id),
            role=m.role,
            bio=m.bio,
            specialties=m.specialties,
            certifications=m.certifications,
            max_caseload=m.max_caseload,
            org_name=org_name,
        )

    return MeResponse(user=me_user, member=me_member)


# ─── PATCH /me ──────────────────────────────────────────────


@router.patch("/me", response_model=PatchMeResponse)
async def patch_me(
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PatchMeResponse:
    """
    改自己的 user-level 字段 (镜像 user.routes.ts:75-104)。

    显式收 ``name`` / ``avatar_url`` 两字段:
      - 都没给 → 400 "没有可更新的字段"
      - ``name`` 给了空字符串 / 全空白 → 400 "姓名不能为空"
      - ``avatar_url`` 给了 ""/null → 视作清空, 写 NULL

    email / is_system_admin / is_guardian_account 不在自服务范围内, sysadm
    专用入口 (admin-tenant) 才能改。
    """
    body: dict[str, Any] = await request.json() if await _has_json_body(request) else {}

    updates: dict[str, Any] = {}
    if "name" in body:
        raw_name = body["name"]
        if not isinstance(raw_name, str):
            raise ValidationError("姓名不能为空")
        trimmed = raw_name.strip()
        if not trimmed:
            raise ValidationError("姓名不能为空")
        updates["name"] = trimmed

    if "avatarUrl" in body or "avatar_url" in body:
        raw_avatar = body.get("avatarUrl", body.get("avatar_url"))
        # falsy ("" / None) → NULL, 与 Node ``body.avatarUrl || null`` 等价
        updates["avatar_url"] = raw_avatar or None

    if not updates:
        raise ValidationError("没有可更新的字段")

    try:
        user_uuid = uuid.UUID(user.id)
    except (ValueError, TypeError) as exc:
        raise ValidationError("用户不存在") from exc

    db_user_q = select(User).where(User.id == user_uuid).limit(1)
    db_user = (await db.execute(db_user_q)).scalar_one_or_none()
    if db_user is None:
        raise ValidationError("用户不存在")

    # 直接在 ORM 实例上 set, commit 后 SQLAlchemy 自动 UPDATE
    for field, value in updates.items():
        setattr(db_user, field, value)
    await db.commit()

    return PatchMeResponse(
        id=str(db_user.id),
        email=db_user.email,
        name=db_user.name,
        avatar_url=db_user.avatar_url,
        is_system_admin=db_user.is_system_admin,
    )


async def _has_json_body(request: Request) -> bool:
    """空 body 兼容 — Node 路由 ``request.body`` 为空对象时不抛, 我们也不抛。"""
    raw = await request.body()
    return bool(raw)
