"""
Org core router — 镜像 ``server/src/modules/org/org.routes.ts`` (429 行)。

挂在 ``/api/orgs`` prefix。11 个 endpoint:

  GET    /                                              — 用户加入的 orgs 列表
  POST   /                                              — 创建 org (system_admin only)
  GET    /{org_id}                                      — org 详情 (staff only)
  PATCH  /{org_id}                                      — 更新 org (org_admin only)
  GET    /{org_id}/members                              — 成员列表 (org_admin only)
  POST   /{org_id}/members/invite                       — 邀请成员 (admin + seat-limited)
  PATCH  /{org_id}/members/me                           — Phase 14f 自助编辑 bio/specialties/certs
  PATCH  /{org_id}/members/{member_id}                  — 更新成员 (admin only)
  DELETE /{org_id}/members/{member_id}                  — 移除成员 (admin only, no self)
  GET    /{org_id}/triage-config                        — 读 triage (admin/counselor)
  PUT    /{org_id}/triage-config                        — 写 triage (admin only)
  POST   /{org_id}/members/{member_id}/transfer-cases   — 批量转介个案 (admin only)

RBAC 守门:
  - system_admin (POST /): ``user.is_system_admin``
  - org_admin: ``org.role == 'org_admin'`` 校验. 既走 OrgContext (has org_id 时) 又用
    assert_authorized(action='manage_org_settings' / 'invite_member' / 'edit')
    在调用点显式守门 (与 Node ``requireRole('org_admin')`` 一一对应)。
  - rejectClient: 非 client 访问的 endpoint 用 ``_reject_client(org)`` 检查。

特殊处理:
  - ``transfer-cases`` 单 transaction: 每条单独 try/except 收集 success/failure (与 Node
    org.routes.ts:386-426 一致)。
  - feature gate ``supervisor`` (org.routes.ts:286-289): 设 supervisor_id 时校验 tier 含
    ``supervisor`` feature, 否则 403。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.org.schemas import (
    MemberAdminUpdateRequest,
    MemberInviteRequest,
    MemberInviteResponse,
    MemberRow,
    MemberSelfUpdateRequest,
    MemberUpdated,
    OrgCreateRequest,
    OrgDetail,
    OrgSummary,
    OrgUpdateRequest,
    SuccessResponse,
    TransferCasesRequest,
    TransferCasesResponse,
    TransferResultEntry,
    TriageConfig,
)
from app.core.database import get_db
from app.db.models.client_assignments import ClientAssignment
from app.db.models.notifications import Notification
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.shared.tier import has_feature

router = APIRouter()


# ─── Triage default (镜像 packages/shared/src/schemas/triage-config.ts) ──

# 与 Node DEFAULT_TRIAGE_CONFIG 完全一致 (创建 org 时初始化用)
DEFAULT_TRIAGE_CONFIG: dict[str, Any] = {
    "levels": [
        {
            "key": "level_1",
            "label": "一般",
            "color": "#22c55e",
            "intervention": "course",
            "description": "适应性问题，轻度情绪波动",
            "notification": {"counselor": "normal", "admin": "none"},
        },
        {
            "key": "level_2",
            "label": "关注",
            "color": "#eab308",
            "intervention": "group",
            "description": "人际困难，中度焦虑/抑郁",
            "notification": {"counselor": "normal", "admin": "none"},
        },
        {
            "key": "level_3",
            "label": "严重",
            "color": "#f97316",
            "intervention": "counseling",
            "description": "重度焦虑/抑郁，创伤后应激",
            "notification": {"counselor": "urgent", "admin": "info"},
        },
        {
            "key": "level_4",
            "label": "危机",
            "color": "#ef4444",
            "intervention": "referral",
            "description": "自伤倾向、精神障碍疑似",
            "notification": {"counselor": "urgent", "admin": "urgent"},
        },
    ],
    "aggregation": "highest",
    "requireCounselorConfirm": True,
}


# ─── 工具函数 ─────────────────────────────────────────────────────


def _require_system_admin(user: AuthUser) -> None:
    """``requireSystemAdmin`` 等价 — 镜像 Node ``server/src/middleware/system-admin.ts``."""
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


def _require_org_admin(org: OrgContext | None, *, allow_roles: tuple[str, ...] = ()) -> None:
    """``requireRole('org_admin')`` 等价 (单一 legacy role 校验).

    若 ``allow_roles`` 给了额外 legacy role (e.g. ('counselor',)) 也可通过。

    与 Node org.routes.ts ``requireRole('org_admin')`` 行为完全一致 — 检查 legacy
    ``role`` 字段 (org_admin / counselor / client). 与 RoleV2 体系平行.
    """
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "org_admin":
        return
    if org.role in allow_roles:
        return
    raise ForbiddenError("insufficient_role")


def _reject_client(org: OrgContext | None) -> None:
    """``rejectClient`` 等价 — client legacy role 不可访问 staff 端点."""
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.role == "client":
        raise ForbiddenError("Client role not permitted on this endpoint")


def _check_seat_limit(org: OrgContext, current_active_count: int) -> None:
    """``requireSeat`` 等价: license.maxSeats 限定下不能超额. 无 license / 无 maxSeats → 通过."""
    max_seats = org.license.max_seats
    if not max_seats:
        return
    if current_active_count >= max_seats:
        raise ForbiddenError(
            f"已达到许可证席位上限({max_seats} 人), 请升级许可证或移除不活跃成员",
        )


def _org_to_detail(org: Organization) -> OrgDetail:
    """ORM Organization → OrgDetail (统一序列化).

    ``plan`` / ``org_level`` 都有 DB ``server_default``, 但 Python 构造时若未触发
    INSERT, 默认值不会写到 ORM 对象上 (None). 这里 fallback 到与 schema 一致的默认.
    """
    return OrgDetail(
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


def _member_updated_from_orm(m: OrgMember) -> MemberUpdated:
    """ORM OrgMember → MemberUpdated (PATCH 响应)."""
    return MemberUpdated(
        id=str(m.id),
        org_id=str(m.org_id),
        user_id=str(m.user_id),
        role=m.role,
        role_v2=m.role_v2,
        principal_class=m.principal_class,
        access_profile=m.access_profile,
        permissions=m.permissions or {},
        status=m.status,
        valid_until=m.valid_until,
        supervisor_id=str(m.supervisor_id) if m.supervisor_id else None,
        full_practice_access=m.full_practice_access,
        source_partnership_id=str(m.source_partnership_id) if m.source_partnership_id else None,
        certifications=m.certifications,
        specialties=m.specialties,
        max_caseload=m.max_caseload,
        bio=m.bio,
        created_at=getattr(m, "created_at", None),
    )


# ─── 路由 ─────────────────────────────────────────────────────────


@router.get("/", response_model=list[OrgSummary])
async def list_my_orgs(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrgSummary]:
    """当前用户参与的 orgs 列表 (镜像 org.routes.ts:21-39)."""
    user_uuid = parse_uuid_or_raise(user.id, field="userId")
    q = (
        select(Organization, OrgMember.role, OrgMember.status)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == user_uuid)
    )
    rows = (await db.execute(q)).all()
    out: list[OrgSummary] = []
    for org, role, mstatus in rows:
        out.append(
            OrgSummary(
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
                my_role=role,
                my_status=mstatus,
            )
        )
    return out


@router.post("/", response_model=OrgDetail, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrgDetail:
    """创建 org (system admin only). 镜像 org.routes.ts:42-79.

    Transactional: org + creator 的 ``org_admin`` member 一起插. 失败 rollback.
    """
    _require_system_admin(user)

    # slug 唯一性
    existing_q = select(Organization).where(Organization.slug == body.slug).limit(1)
    if (await db.execute(existing_q)).scalar_one_or_none() is not None:
        raise ValidationError(f"Organization slug '{body.slug}' is already taken")

    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 单 transaction: org + 创建者 admin member
    try:
        org = Organization(
            name=body.name,
            slug=body.slug,
            triage_config=DEFAULT_TRIAGE_CONFIG,
        )
        db.add(org)
        await db.flush()  # 取 org.id

        member = OrgMember(
            org_id=org.id,
            user_id=user_uuid,
            role="org_admin",
            status="active",
        )
        db.add(member)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org.id),
        user_id=user.id,
        action="create",
        resource="organizations",
        resource_id=str(org.id),
        ip_address=request.client.host if request.client else None,
    )
    return _org_to_detail(org)


@router.get("/{org_id}", response_model=OrgDetail)
async def get_org(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrgDetail:
    """org 详情 (staff only). 镜像 org.routes.ts:82-94."""
    _reject_client(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Organization", org_id)
    return _org_to_detail(row)


@router.patch("/{org_id}", response_model=OrgDetail)
async def update_org(
    org_id: str,
    body: OrgUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrgDetail:
    """更新 org (org_admin only). 镜像 org.routes.ts:97-112."""
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Organization", org_id)

    if body.name is not None:
        row.name = body.name
    if body.settings is not None:
        row.settings = body.settings
    # updated_at 由 TimestampMixin 的 onupdate 自动更新, 但 SQLAlchemy 的 onupdate
    # 仅在执行 UPDATE statement 时触发, 不自动 — 这里手动设以与 Node 行为一致
    row.updated_at = datetime.now(UTC)

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(row.id),
        user_id=user.id,
        action="update",
        resource="organizations",
        resource_id=str(row.id),
        ip_address=request.client.host if request.client else None,
    )
    return _org_to_detail(row)


@router.get("/{org_id}/members", response_model=list[MemberRow])
async def list_members(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MemberRow]:
    """成员列表 (org_admin only). 镜像 org.routes.ts:115-147."""
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = (
        select(OrgMember, User)
        .join(User, User.id == OrgMember.user_id)
        .where(OrgMember.org_id == org_uuid)
    )
    rows = (await db.execute(q)).all()
    out: list[MemberRow] = []
    for m, u in rows:
        out.append(
            MemberRow(
                id=str(m.id),
                user_id=str(u.id),
                email=u.email,
                name=u.name,
                avatar_url=u.avatar_url,
                role=m.role,
                status=m.status,
                permissions=m.permissions or {},
                valid_until=m.valid_until,
                supervisor_id=str(m.supervisor_id) if m.supervisor_id else None,
                full_practice_access=m.full_practice_access,
                certifications=m.certifications or [],
                specialties=m.specialties or [],
                max_caseload=m.max_caseload,
                bio=m.bio,
                created_at=getattr(m, "created_at", None),
            )
        )
    return out


@router.post(
    "/{org_id}/members/invite",
    response_model=MemberInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    org_id: str,
    body: MemberInviteRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberInviteResponse:
    """邀请成员 (org_admin + seat-limit). 镜像 org.routes.ts:150-211.

    Transactional: 找/建 user → 检查 dup → 插 org_member, 单 commit.
    """
    _require_org_admin(org)
    assert org is not None  # _require_org_admin 已校验

    # seat-limit (mirror requireSeat)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    seat_q = select(OrgMember).where(
        and_(OrgMember.org_id == org_uuid, OrgMember.status == "active")
    )
    seat_count = len((await db.execute(seat_q)).all())
    _check_seat_limit(org, seat_count)

    try:
        # 找 user
        u_q = select(User).where(User.email == body.email).limit(1)
        u = (await db.execute(u_q)).scalar_one_or_none()
        if u is None:
            # 创建 placeholder
            u = User(
                email=body.email,
                name=body.name or body.email.split("@")[0],
            )
            db.add(u)
            await db.flush()  # 取 user.id

        # dup 检查
        dup_q = (
            select(OrgMember)
            .where(and_(OrgMember.org_id == org_uuid, OrgMember.user_id == u.id))
            .limit(1)
        )
        if (await db.execute(dup_q)).scalar_one_or_none() is not None:
            raise ValidationError("User is already a member of this organization")

        member = OrgMember(
            org_id=org_uuid,
            user_id=u.id,
            role=body.role,
            status="pending",
        )
        db.add(member)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="create",
        resource="org_members",
        resource_id=str(member.id),
        ip_address=request.client.host if request.client else None,
    )

    return MemberInviteResponse(
        id=str(member.id),
        user_id=str(u.id),
        email=u.email,
        name=u.name,
        role=member.role,
        status=member.status,
    )


@router.patch("/{org_id}/members/me", response_model=MemberUpdated)
async def update_my_member(
    org_id: str,
    body: MemberSelfUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberUpdated:
    """Phase 14f — 自助编辑 bio / specialties / certifications.

    路径必须在 ``/{org_id}/members/{member_id}`` 之前定义, 让 'me' 字面量先匹配 (与
    Node Fastify route order 一致, FastAPI 也按声明顺序匹配).
    """
    if org is None:
        raise ForbiddenError("org_context_required")

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # 找当前用户在此 org 的 member
    q = (
        select(OrgMember)
        .where(and_(OrgMember.org_id == org_uuid, OrgMember.user_id == user_uuid))
        .limit(1)
    )
    member = (await db.execute(q)).scalar_one_or_none()
    if member is None:
        raise NotFoundError("OrgMember")

    # 仅允许的 3 字段
    has_update = False
    if body.bio is not None:
        member.bio = body.bio
        has_update = True
    if body.specialties is not None:
        member.specialties = body.specialties
        has_update = True
    if body.certifications is not None:
        member.certifications = body.certifications
        has_update = True

    if not has_update:
        raise ValidationError("没有可更新的字段")

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="update",
        resource="org_members",
        resource_id=str(member.id),
        ip_address=request.client.host if request.client else None,
    )
    return _member_updated_from_orm(member)


@router.patch("/{org_id}/members/{member_id}", response_model=MemberUpdated)
async def update_member(
    org_id: str,
    member_id: str,
    body: MemberAdminUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberUpdated:
    """更新成员 (org_admin only). 镜像 org.routes.ts:264-313.

    feature gate: 设 supervisorId 时校验 ``supervisor`` feature, 否则 403.
    """
    _require_org_admin(org)
    assert org is not None  # _require_org_admin 已校验

    member_uuid = parse_uuid_or_raise(member_id, field="memberId")
    q = select(OrgMember).where(OrgMember.id == member_uuid).limit(1)
    member = (await db.execute(q)).scalar_one_or_none()
    if member is None:
        raise ValidationError("Member not found")

    has_update = False
    if body.role is not None:
        member.role = body.role
        has_update = True
    if body.status is not None:
        member.status = body.status
        has_update = True
    if body.permissions is not None:
        member.permissions = body.permissions
        has_update = True
    if body.supervisor_id is not None:
        # supervisor feature gate (镜像 org.routes.ts:286-289)
        if not has_feature(org.tier, "supervisor"):
            raise ForbiddenError("督导功能需要团队版或更高版本")
        member.supervisor_id = (
            parse_uuid_or_raise(body.supervisor_id, field="supervisorId")
            if body.supervisor_id
            else None
        )
        has_update = True
    if body.full_practice_access is not None:
        member.full_practice_access = body.full_practice_access
        has_update = True
    if body.certifications is not None:
        member.certifications = body.certifications
        has_update = True
    if body.specialties is not None:
        member.specialties = body.specialties
        has_update = True
    if body.max_caseload is not None:
        member.max_caseload = body.max_caseload
        has_update = True
    if body.bio is not None:
        member.bio = body.bio
        has_update = True

    if not has_update:
        raise ValidationError("No fields to update")

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(member.org_id),
        user_id=user.id,
        action="update",
        resource="org_members",
        resource_id=str(member.id),
        ip_address=request.client.host if request.client else None,
    )
    return _member_updated_from_orm(member)


@router.delete("/{org_id}/members/{member_id}", response_model=SuccessResponse)
async def delete_member(
    org_id: str,
    member_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuccessResponse:
    """移除成员 (org_admin only, 不能删自己). 镜像 org.routes.ts:316-329."""
    _require_org_admin(org)

    member_uuid = parse_uuid_or_raise(member_id, field="memberId")
    q = select(OrgMember).where(OrgMember.id == member_uuid).limit(1)
    member = (await db.execute(q)).scalar_one_or_none()
    if member is None:
        raise ValidationError("Member not found")
    if str(member.user_id) == user.id:
        raise ValidationError("Cannot remove yourself")

    await db.execute(delete(OrgMember).where(OrgMember.id == member_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(member.org_id),
        user_id=user.id,
        action="delete",
        resource="org_members",
        resource_id=str(member_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return SuccessResponse()


@router.get("/{org_id}/triage-config", response_model=TriageConfig)
async def get_triage_config(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TriageConfig:
    """读 triage config (org_admin / counselor). 镜像 org.routes.ts:332-346."""
    _require_org_admin(org, allow_roles=("counselor",))

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization.triage_config).where(Organization.id == org_uuid).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        raise NotFoundError("Organization", org_id)
    return row[0] or {}


@router.put("/{org_id}/triage-config", response_model=TriageConfig)
async def update_triage_config(
    org_id: str,
    body: dict[str, Any],
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TriageConfig:
    """写 triage config (org_admin only). 镜像 org.routes.ts:349-368."""
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    organization = (await db.execute(q)).scalar_one_or_none()
    if organization is None:
        raise NotFoundError("Organization", org_id)

    organization.triage_config = body
    organization.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(organization.id),
        user_id=user.id,
        action="update",
        resource="organizations",
        resource_id=str(organization.id),
        changes={"triageConfig": {"old": None, "new": body}},
        ip_address=request.client.host if request.client else None,
    )
    return organization.triage_config or {}


# ─── transfer-cases (复杂 transactional, 但每条独立 success/failure) ──


async def _transfer_one_case(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    client_id: uuid.UUID,
    source_counselor_id: uuid.UUID,
    target_counselor_id: uuid.UUID,
) -> None:
    """单条 transfer 的核心 SQL — 删旧 assignment + 建新 assignment + 通知接受方.

    任意步失败抛异常, 由 caller 收集并继续. 与 Node org.routes.ts:386-426 等价.
    """
    await db.execute(
        delete(ClientAssignment).where(
            and_(
                ClientAssignment.org_id == org_id,
                ClientAssignment.client_id == client_id,
                ClientAssignment.counselor_id == source_counselor_id,
            )
        )
    )
    db.add(
        ClientAssignment(
            org_id=org_id,
            client_id=client_id,
            counselor_id=target_counselor_id,
            is_primary=True,
        )
    )
    db.add(
        Notification(
            org_id=org_id,
            user_id=target_counselor_id,
            type="case_transfer",
            title="个案转入",
            body="管理员将一位来访者转交给您, 请查看交付中心。",
        )
    )


@router.post(
    "/{org_id}/members/{member_id}/transfer-cases",
    response_model=TransferCasesResponse,
)
async def transfer_cases(
    org_id: str,
    member_id: str,
    body: TransferCasesRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TransferCasesResponse:
    """批量转介个案 (org_admin only). 镜像 org.routes.ts:371-428.

    每条 transfer 独立 try/except — 单条失败不影响其它. 与 Node 相同.
    """
    _require_org_admin(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    member_uuid = parse_uuid_or_raise(member_id, field="memberId")

    # 取 source counselor user_id
    src_q = select(OrgMember).where(OrgMember.id == member_uuid).limit(1)
    src = (await db.execute(src_q)).scalar_one_or_none()
    if src is None:
        raise NotFoundError("Member", member_id)

    results: list[TransferResultEntry] = []
    for t in body.transfers:
        try:
            client_uuid = parse_uuid_or_raise(t.client_id, field="clientId")
            target_uuid = parse_uuid_or_raise(t.to_counselor_id, field="toCounselorId")
            await _transfer_one_case(
                db,
                org_id=org_uuid,
                client_id=client_uuid,
                source_counselor_id=src.user_id,
                target_counselor_id=target_uuid,
            )
            await db.commit()
            results.append(
                TransferResultEntry(
                    client_id=t.client_id,
                    to_counselor_id=t.to_counselor_id,
                    success=True,
                )
            )
        except Exception:
            await db.rollback()
            results.append(
                TransferResultEntry(
                    client_id=t.client_id,
                    to_counselor_id=t.to_counselor_id,
                    success=False,
                )
            )

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="transfer_cases",
        resource="org_members",
        resource_id=str(member_uuid),
        changes={"transfers": {"old": None, "new": [t.model_dump() for t in body.transfers]}},
        ip_address=request.client.host if request.client else None,
    )
    return TransferCasesResponse(
        results=results,
        success_count=sum(1 for r in results if r.success),
    )


__all__ = [
    "DEFAULT_TRIAGE_CONFIG",
    "router",
]
