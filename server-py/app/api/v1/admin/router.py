"""
Admin core router — 镜像 ``server/src/modules/admin/admin.routes.ts`` (311 行).

挂在 ``/api/admin`` prefix. **所有 endpoint 强制 ``user.is_system_admin``** —
镜像 Node 的 ``app.addHook('preHandler', requireSystemAdmin)`` 全 router 守门。

15 个 endpoint:

  Platform Stats
    GET  /stats                                    — 三张表 count

  Org Management
    GET  /orgs                                     — 全平台 orgs 列表 + memberCount
    GET  /orgs/{org_id}                            — org 详情 + members 嵌套
    PATCH /orgs/{org_id}                           — 更新 plan / settings

  User Management
    GET  /users                                    — 全平台 users 列表 (?search= 模糊)
    GET  /users/{user_id}                          — user 详情 + memberships 嵌套
    POST /users                                    — 创建 user (含 is_system_admin)
    PATCH /users/{user_id}                         — 改 name / is_system_admin
    POST /users/{user_id}/reset-password           — 重置密码
    POST /users/{user_id}/toggle-status            — 启/禁用所有 memberships

  System Config
    GET  /config                                   — 6 category 合并 (defaults + DB cache)
    PATCH /config                                  — 部分字段更新 (skip 只读 email/ai/_meta)

Phase 3 阶段实装注:
  ``getAllConfig()`` / ``setConfig`` / ``getRestartRequired()`` 走 SystemConfig
  ORM 表; ``email/ai`` 子结构由 env (Settings) 推导 (与 Node 的 ``import('../../config/env.js')``
  等价). license JWT 验证 (verify.ts) Phase 5 接入.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.schemas import (
    AdminOrgDetail,
    AdminOrgMemberRow,
    AdminOrgRow,
    AdminOrgUpdated,
    AdminOrgUpdateRequest,
    AdminUserCreated,
    AdminUserCreateRequest,
    AdminUserDetail,
    AdminUserMembership,
    AdminUserResetPasswordRequest,
    AdminUserRow,
    AdminUserToggleStatusRequest,
    AdminUserToggleStatusResponse,
    AdminUserUpdateRequest,
    OkResponse,
    PlatformStats,
    SystemConfigPayload,
)
from app.core.database import get_db
from app.core.security import hash_password
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.system_config import SystemConfig
from app.db.models.users import User
from app.lib.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()


# ─── 守门 helper (镜像 Node middleware/system-admin.ts) ─────────────


def _require_system_admin(user: AuthUser) -> None:
    """镜像 ``server/src/middleware/system-admin.ts`` 的 ``requireSystemAdmin`` (Node 全 router 用 hook).

    Node 用 ``app.addHook('preHandler', requireSystemAdmin)`` 自动跑;
    Python FastAPI 没有 router-level preHandler 等价物, 在每个 handler 显式调用.
    """
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


# ─── Platform Stats — admin.routes.ts:15-24 ────────────────────────


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformStats:
    """三张表 count (sysadm only). 镜像 admin.routes.ts:15-24."""
    _require_system_admin(user)

    # 单 SQL 多 scalar subquery (与 dashboard_router 优化思路一致, 1 round-trip)
    org_q = select(func.count()).select_from(Organization)
    user_q = select(func.count()).select_from(User)
    member_q = select(func.count()).select_from(OrgMember)

    combined = select(
        org_q.scalar_subquery().label("org_count"),
        user_q.scalar_subquery().label("user_count"),
        member_q.scalar_subquery().label("member_count"),
    )
    row = (await db.execute(combined)).first()
    counts = list(row) if row is not None else [0, 0, 0]

    return PlatformStats(
        organizations=int(counts[0] or 0),
        users=int(counts[1] or 0),
        memberships=int(counts[2] or 0),
    )


# ─── Org Management — admin.routes.ts:28-74 ────────────────────────


@router.get("/orgs", response_model=list[AdminOrgRow])
async def list_orgs(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AdminOrgRow]:
    """全平台 orgs 列表 + memberCount. 镜像 admin.routes.ts:28-43.

    Node 用 ``count(orgMembers.id)`` left-join group by; SQLAlchemy 等价用
    ``func.count(OrgMember.id)`` + ``outerjoin`` + ``group_by``.
    """
    _require_system_admin(user)

    q = (
        select(
            Organization.id,
            Organization.name,
            Organization.slug,
            Organization.plan,
            Organization.created_at,
            func.count(OrgMember.id).label("member_count"),
        )
        .outerjoin(OrgMember, OrgMember.org_id == Organization.id)
        .group_by(Organization.id)
        .order_by(Organization.created_at)
    )
    rows = (await db.execute(q)).all()
    return [
        AdminOrgRow(
            id=str(r.id),
            name=r.name,
            slug=r.slug,
            plan=r.plan or "free",
            created_at=r.created_at,
            member_count=int(r.member_count or 0),
        )
        for r in rows
    ]


@router.get("/orgs/{org_id}", response_model=AdminOrgDetail)
async def get_org_detail(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminOrgDetail:
    """org 详情 + members. 镜像 admin.routes.ts:45-67."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")

    org_q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(org_q)).scalar_one_or_none()
    if org is None:
        # 与 Node 'Organization not found' 等价 (Node 抛裸 Error → 500;
        # 这里走 NotFoundError → 404, 行为更合理)
        raise NotFoundError("Organization", org_id)

    members_q = (
        select(OrgMember, User)
        .join(User, User.id == OrgMember.user_id)
        .where(OrgMember.org_id == org_uuid)
    )
    members_rows = (await db.execute(members_q)).all()

    members = [
        AdminOrgMemberRow(
            id=str(m.id),
            user_id=str(m.user_id),
            role=m.role,
            status=m.status,
            full_practice_access=m.full_practice_access,
            supervisor_id=str(m.supervisor_id) if m.supervisor_id else None,
            created_at=getattr(m, "created_at", None),
            user_name=u.name,
            user_email=u.email,
        )
        for m, u in members_rows
    ]

    return AdminOrgDetail(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        plan=org.plan or "free",
        license_key=org.license_key,
        settings=org.settings or {},
        triage_config=org.triage_config or {},
        data_retention_policy=org.data_retention_policy,
        parent_org_id=str(org.parent_org_id) if org.parent_org_id else None,
        org_level=org.org_level or "leaf",
        created_at=getattr(org, "created_at", None),
        updated_at=getattr(org, "updated_at", None),
        members=members,
    )


@router.patch("/orgs/{org_id}", response_model=AdminOrgUpdated)
async def update_org(
    org_id: str,
    body: AdminOrgUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminOrgUpdated:
    """更新 plan / settings (sysadm only). 镜像 admin.routes.ts:69-74."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_id)

    if body.plan is not None:
        org.plan = body.plan
    if body.settings is not None:
        org.settings = body.settings
    org.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org.id),
        user_id=user.id,
        action="update",
        resource="organizations",
        resource_id=str(org.id),
        ip_address=request.client.host if request.client else None,
    )

    return AdminOrgUpdated(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        plan=org.plan or "free",
        license_key=org.license_key,
        settings=org.settings or {},
        triage_config=org.triage_config or {},
        data_retention_policy=org.data_retention_policy,
        parent_org_id=str(org.parent_org_id) if org.parent_org_id else None,
        org_level=org.org_level or "leaf",
        created_at=getattr(org, "created_at", None),
        updated_at=getattr(org, "updated_at", None),
    )


# ─── User Management — admin.routes.ts:76-209 ──────────────────────


@router.get("/users", response_model=list[AdminUserRow])
async def list_users(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    search: Annotated[str | None, Query()] = None,
) -> list[AdminUserRow]:
    """全平台 users + memberCount. 镜像 admin.routes.ts:79-107.

    ?search= 走 ``ilike`` 在 (name, email) 之一上模糊匹配 (与 Node ``or(ilike, ilike)`` 一致).
    """
    _require_system_admin(user)

    q = (
        select(
            User.id,
            User.email,
            User.name,
            User.is_system_admin,
            User.created_at,
            func.count(OrgMember.id).label("org_count"),
        )
        .outerjoin(OrgMember, OrgMember.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )

    if search:
        like_pat = f"%{search}%"
        q = q.where(or_(User.name.ilike(like_pat), User.email.ilike(like_pat)))

    rows = (await db.execute(q)).all()
    return [
        AdminUserRow(
            id=str(r.id),
            email=r.email,
            name=r.name,
            is_system_admin=r.is_system_admin,
            created_at=r.created_at,
            org_count=int(r.org_count or 0),
        )
        for r in rows
    ]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserDetail:
    """user 详情 + memberships. 镜像 admin.routes.ts:110-140."""
    _require_system_admin(user)

    target_uuid = parse_uuid_or_raise(user_id, field="userId")

    u_q = select(User).where(User.id == target_uuid).limit(1)
    target = (await db.execute(u_q)).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User", user_id)

    mem_q = (
        select(OrgMember, Organization)
        .join(Organization, Organization.id == OrgMember.org_id)
        .where(OrgMember.user_id == target_uuid)
    )
    mem_rows = (await db.execute(mem_q)).all()
    memberships = [
        AdminUserMembership(
            id=str(m.id),
            org_id=str(m.org_id),
            role=m.role,
            status=m.status,
            full_practice_access=m.full_practice_access,
            supervisor_id=str(m.supervisor_id) if m.supervisor_id else None,
            created_at=getattr(m, "created_at", None),
            org_name=o.name,
            org_slug=o.slug,
            org_plan=o.plan or "free",
        )
        for m, o in mem_rows
    ]

    return AdminUserDetail(
        id=str(target.id),
        email=target.email,
        name=target.name,
        is_system_admin=target.is_system_admin,
        created_at=getattr(target, "created_at", None),
        memberships=memberships,
    )


@router.post(
    "/users",
    response_model=AdminUserCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    body: AdminUserCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserCreated:
    """创建 user. 镜像 admin.routes.ts:143-170.

    复用现有邮箱: 抛 409 (Node 是 'Error: 该邮箱已存在' → 500; 这里走 ConflictError 更合理).
    """
    _require_system_admin(user)

    email_norm = body.email.strip().lower()

    dup_q = select(User).where(User.email == email_norm).limit(1)
    if (await db.execute(dup_q)).scalar_one_or_none() is not None:
        raise ConflictError("该邮箱已存在")

    new_user = User(
        email=email_norm,
        name=body.name,
        password_hash=hash_password(body.password),
        is_system_admin=bool(body.is_system_admin) if body.is_system_admin is not None else False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="user.created",
        resource="users",
        resource_id=str(new_user.id),
        ip_address=request.client.host if request.client else None,
    )

    return AdminUserCreated(
        id=str(new_user.id),
        email=new_user.email,
        name=new_user.name,
        is_system_admin=new_user.is_system_admin,
        created_at=getattr(new_user, "created_at", None),
    )


@router.patch("/users/{user_id}", response_model=AdminUserCreated)
async def update_user(
    user_id: str,
    body: AdminUserUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserCreated:
    """改 name / is_system_admin. 镜像 admin.routes.ts:173-188."""
    _require_system_admin(user)

    target_uuid = parse_uuid_or_raise(user_id, field="userId")
    q = select(User).where(User.id == target_uuid).limit(1)
    target = (await db.execute(q)).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User", user_id)

    if body.name is not None:
        target.name = body.name
    if body.is_system_admin is not None:
        target.is_system_admin = body.is_system_admin

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="user.updated",
        resource="users",
        resource_id=str(target.id),
        ip_address=request.client.host if request.client else None,
    )

    return AdminUserCreated(
        id=str(target.id),
        email=target.email,
        name=target.name,
        is_system_admin=target.is_system_admin,
        created_at=getattr(target, "created_at", None),
    )


@router.post("/users/{user_id}/reset-password", response_model=OkResponse)
async def reset_user_password(
    user_id: str,
    body: AdminUserResetPasswordRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """重置 user 密码. 镜像 admin.routes.ts:191-198.

    Pydantic ``min_length=6`` 已 catch 短密码 (与 Node ``password.length < 6`` 一致).
    """
    _require_system_admin(user)

    target_uuid = parse_uuid_or_raise(user_id, field="userId")
    q = select(User).where(User.id == target_uuid).limit(1)
    target = (await db.execute(q)).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User", user_id)

    target.password_hash = hash_password(body.password)
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="user.password_reset",
        resource="users",
        resource_id=str(target.id),
        ip_address=request.client.host if request.client else None,
    )
    return OkResponse()


@router.post("/users/{user_id}/toggle-status", response_model=AdminUserToggleStatusResponse)
async def toggle_user_status(
    user_id: str,
    body: AdminUserToggleStatusRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserToggleStatusResponse:
    """启/禁用 user 的全部 memberships. 镜像 admin.routes.ts:201-208.

    与 Node 一致: 直接 update org_members WHERE user_id, 不检查 user 是否存在
    (没成员的 user 此 op 是 no-op).
    """
    _require_system_admin(user)

    target_uuid = parse_uuid_or_raise(user_id, field="userId")
    new_status = "disabled" if body.disabled else "active"

    # 单 SQL UPDATE — 不需要先 select.
    from sqlalchemy import update as sql_update

    await db.execute(
        sql_update(OrgMember).where(OrgMember.user_id == target_uuid).values(status=new_status)
    )
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="user.toggle_status",
        resource="users",
        resource_id=str(target_uuid),
        changes={"status": {"old": None, "new": new_status}},
        ip_address=request.client.host if request.client else None,
    )

    return AdminUserToggleStatusResponse(ok=True, status=new_status)


# ─── System Config — admin.routes.ts:213-310 ───────────────────────


def _build_default_config() -> dict[str, dict[str, Any]]:
    """6 类默认骨架 — 与 Node admin.routes.ts:228-242 等价.

    email/ai 是只读, 由 env (Settings) 推; 其余从 hardcode 默认.

    Phase 3 阶段: SMTP / AI 类 env 字段在 ``app/core/config.py`` 里没建模
    (mailer.py 是 stub), 6-category 骨架仍要返回 ``configured: False`` 占位
    让前端 ``SystemConfig.tsx`` 不至于崩 (与 Node fallback 等价).
    """
    smtp_host = ""
    smtp_user = ""
    ai_api_key = ""
    ai_model = ""
    ai_base_url = ""

    return {
        "platform": {"name": "Psynote", "version": "0.1.0"},
        "security": {
            "accessTokenExpiry": "7d",
            "refreshTokenExpiry": "30d",
            "minPasswordLength": 6,
        },
        "defaults": {"orgPlan": "free", "maxMembersPerOrg": 100},
        "limits": {"rateLimitMax": 100, "fileUploadMaxMB": 50},
        "email": {
            "configured": bool(smtp_host and smtp_user),
            "host": smtp_host,
        },
        "ai": {
            "configured": bool(ai_api_key),
            "model": ai_model,
            "baseUrl": ai_base_url,
        },
    }


async def _load_db_config(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """读 system_config 表全量并 group by category. 等价 Node ``getAllConfig()``."""
    q = select(SystemConfig)
    rows = (await db.execute(q)).scalars().all()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        cat = out.setdefault(row.category, {})
        # value JSONB 存的是 ``{"v": ...}`` 包裹 (与 Node setConfig 一致)
        # — 测试期可能没包裹, 兼容 raw value
        if isinstance(row.value, dict) and "v" in row.value:
            cat[row.key] = row.value["v"]
        else:
            cat[row.key] = row.value
    return out


async def _load_restart_required(db: AsyncSession) -> bool:
    """有任意 ``requires_restart=true`` 配置项被改 → True. 等价 Node ``getRestartRequired()``."""
    q = select(func.count()).where(SystemConfig.requires_restart.is_(True))
    n = (await db.execute(q)).scalar() or 0
    return bool(n)


@router.get("/config", response_model=SystemConfigPayload)
async def get_config(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SystemConfigPayload:
    """6 category 合并 (defaults + DB cache). 镜像 admin.routes.ts:214-257.

    历史 bug 修法 (见 Node 注释 219-227): 干净 DB 没 setConfig 时 `getAllConfig() = {}`,
    前端 6-category 骨架直接 `config.platform.name → undefined.name` 崩;
    这里 merge defaults 让 6 category 始终存在.
    """
    _require_system_admin(user)

    defaults = _build_default_config()
    db_config = await _load_db_config(db)
    restart_required = await _load_restart_required(db)

    merged: dict[str, dict[str, Any]] = {k: dict(v) for k, v in defaults.items()}
    for category, values in db_config.items():
        merged.setdefault(category, {})
        merged[category].update(values)

    payload: dict[str, Any] = dict(merged)
    payload["_meta"] = {
        "restartRequired": restart_required,
        "lastUpdated": None,
    }
    return payload


# 字段验证器 — 与 Node admin.routes.ts:266-277 一一对应 (类型 + 区间).
import re  # noqa: E402

_DURATION_RE = re.compile(r"^\d+[mhd]$")


def _validate_config_field(category: str, key: str, value: Any) -> str | None:
    """返回错误描述 / None (合法). 与 Node validators dict 等价."""
    full_key = f"{category}.{key}"
    if full_key in ("security.accessTokenExpiry", "security.refreshTokenExpiry"):
        if not (isinstance(value, str) and _DURATION_RE.match(value)):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key == "security.minPasswordLength":
        if not (isinstance(value, int) and not isinstance(value, bool) and 4 <= value <= 32):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key == "defaults.orgPlan":
        if not (isinstance(value, str) and value in ("free", "pro", "enterprise")):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key == "defaults.maxMembersPerOrg":
        if not (isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 10000):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key == "limits.rateLimitMax":
        if not (isinstance(value, int) and not isinstance(value, bool) and 10 <= value <= 10000):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key == "limits.fileUploadMaxMB":
        if not (isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 2048):
            return f"Invalid value for {full_key}: {value!r}"
    elif full_key in ("platform.name", "platform.version"):
        max_len = 100 if key == "name" else 50
        if not (isinstance(value, str) and 1 <= len(value) <= max_len):
            return f"Invalid value for {full_key}: {value!r}"
    return None


async def _set_config(
    db: AsyncSession,
    category: str,
    key: str,
    value: Any,
    updated_by: str,
) -> None:
    """单条 UPSERT — 与 Node ``setConfig(category, key, value, userId)`` 等价."""
    q = (
        select(SystemConfig)
        .where(and_(SystemConfig.category == category, SystemConfig.key == key))
        .limit(1)
    )
    existing = (await db.execute(q)).scalar_one_or_none()
    user_uuid = parse_uuid_or_raise(updated_by, field="userId")

    # value 包一层 ``{"v": ...}`` — JSONB column 不接受顶层非 object,
    # 与 Node setConfig 写入 ``JSON.stringify(value)`` 后再读出 parse 等价.
    wrapped = {"v": value}

    if existing is None:
        db.add(
            SystemConfig(
                category=category,
                key=key,
                value=wrapped,
                updated_by=user_uuid,
            )
        )
    else:
        existing.value = wrapped
        existing.updated_by = user_uuid
        existing.updated_at = datetime.now(UTC)


@router.patch("/config", response_model=SystemConfigPayload)
async def patch_config(
    body: dict[str, Any],
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SystemConfigPayload:
    """部分字段更新. 镜像 admin.routes.ts:260-310.

    Skip 只读 / meta categories: ``email`` / ``ai`` / ``_meta``.
    """
    _require_system_admin(user)

    errors: list[str] = []

    for category, entries in body.items():
        if not isinstance(entries, dict):
            continue
        if category in ("email", "ai", "_meta"):
            continue
        for key, value in entries.items():
            err = _validate_config_field(category, key, value)
            if err is not None:
                errors.append(err)
                continue
            await _set_config(db, category, key, value, user.id)

    if errors:
        raise ValidationError("; ".join(errors))

    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="system_config.updated",
        resource="system_config",
        resource_id=None,
        ip_address=request.client.host if request.client else None,
    )

    db_config = await _load_db_config(db)
    restart_required = await _load_restart_required(db)
    payload: dict[str, Any] = dict(db_config)
    payload["_meta"] = {
        "restartRequired": restart_required,
        "lastUpdated": datetime.now(UTC).isoformat(),
    }
    return payload


__all__ = ["router"]
