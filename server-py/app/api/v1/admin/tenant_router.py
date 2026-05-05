"""
Admin tenant router — 镜像 ``server/src/modules/admin/admin-tenant.routes.ts`` (528 行).

挂在 ``/api/admin/tenants`` prefix. 9 个 endpoint:

  GET    /                                — 全机构列表 + license + EAP partnership 数
  GET    /{org_id}                        — 单机构详情 + members + license
  POST   /                                — 新建租户 (wizard, 含 admin 用户三种策略)
  PATCH  /{org_id}                        — 更新 (name / slug / orgType)
  DELETE /{org_id}                        — 删除租户 (cascade members)
  POST   /{org_id}/members                — 加成员 (与 invite 类似但 sysadm 直接加)
  PATCH  /{org_id}/members/{member_id}    — 改成员 role/status/clinical_practitioner
  DELETE /{org_id}/members/{member_id}    — 移除成员
  GET    /{org_id}/services               — 读 AI/Email service config (masked)
  PATCH  /{org_id}/services               — 更新 service config

强制 sysadm 守门 (与 Node ``app.addHook('preHandler', requireSystemAdmin)`` 等价).

Phase 3 阶段实装注:
  ``signLicense`` 是 admin-license stub (见 admin-license_router.py 注释), tenant
  创建时 license_key 走同一格式. ``DEFAULT_TRIAGE_CONFIG`` 复用 ``app.api.v1.org.router``
  里已定义的 (跨 import 而非 duplicate).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.license_router import (
    VALID_TIERS,
    _stub_token_payload,
    _verify_token,
)
from app.api.v1.admin.schemas import (
    AIConfigMasked,
    EmailConfigMasked,
    LicenseStatusInfo,
    OkResponse,
    SuccessResponse,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantDetail,
    TenantListRow,
    TenantMemberAddRequest,
    TenantMemberAddResponse,
    TenantMemberPatchRequest,
    TenantMemberPatchResponse,
    TenantMemberRow,
    TenantServicesResponse,
    TenantServicesUpdateRequest,
    TenantUpdated,
    TenantUpdateRequest,
)
from app.api.v1.org.router import DEFAULT_TRIAGE_CONFIG
from app.core.database import get_db
from app.core.security import hash_password
from app.db.models.eap_partnerships import EAPPartnership
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()

VALID_ROLES = ("org_admin", "counselor", "client")
ALLOWED_ORG_TYPES = ("solo", "counseling", "enterprise", "school", "hospital")

_PLAN_MAP: dict[str, str] = {
    "starter": "free",
    "growth": "pro",
    "flagship": "enterprise",
    "solo": "free",
    "team": "pro",
    "enterprise": "enterprise",
    "platform": "platform",
}

# slug 校验正则 (与 Node admin-tenant.routes.ts:146-148 ``/^[a-z0-9-]+$/`` 等价)
import re  # noqa: E402

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def _require_system_admin(user: AuthUser) -> None:
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


def _to_license_status(license_key: str | None) -> LicenseStatusInfo:
    return _verify_token(license_key)


# ─── List Tenants — admin-tenant.routes.ts:33-91 ─────────────────────


@router.get("/", response_model=list[TenantListRow])
async def list_tenants(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TenantListRow]:
    """全机构列表 + license + EAP partnership 数 (sysadm only)."""
    _require_system_admin(user)

    orgs_q = (
        select(
            Organization.id,
            Organization.name,
            Organization.slug,
            Organization.plan,
            Organization.license_key,
            Organization.settings,
            Organization.created_at,
            func.count(OrgMember.id).label("member_count"),
        )
        .outerjoin(OrgMember, OrgMember.org_id == Organization.id)
        .group_by(Organization.id)
        .order_by(Organization.created_at)
    )
    org_rows = (await db.execute(orgs_q)).all()

    # EAP partnerships count (per enterprise org)
    part_q = select(EAPPartnership.enterprise_org_id, func.count().label("cnt")).group_by(
        EAPPartnership.enterprise_org_id
    )
    part_rows = (await db.execute(part_q)).all()
    part_map = {r.enterprise_org_id: int(r.cnt or 0) for r in part_rows}

    out: list[TenantListRow] = []
    for r in org_rows:
        settings_dict = (r.settings or {}) if isinstance(r.settings, dict) else {}
        org_type = str(settings_dict.get("orgType") or "counseling")
        is_enterprise = org_type == "enterprise"
        partnership_count = part_map.get(r.id, 0) if is_enterprise else 0

        out.append(
            TenantListRow(
                id=str(r.id),
                name=r.name,
                slug=r.slug,
                plan=r.plan or "free",
                settings=settings_dict,
                created_at=r.created_at,
                member_count=int(r.member_count or 0),
                org_type=org_type,
                is_enterprise=is_enterprise,
                partnership_count=partnership_count,
                license=_to_license_status(r.license_key),
            )
        )
    return out


# ─── Tenant Detail — admin-tenant.routes.ts:94-130 ───────────────────


@router.get("/{org_id}", response_model=TenantDetail)
async def get_tenant_detail(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantDetail:
    """单机构详情 + members + license (sysadm only)."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    org_q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(org_q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_id)

    mem_q = (
        select(OrgMember, User)
        .join(User, User.id == OrgMember.user_id)
        .where(OrgMember.org_id == org_uuid)
    )
    mem_rows = (await db.execute(mem_q)).all()
    members = [
        TenantMemberRow(
            id=str(m.id),
            user_id=str(m.user_id),
            role=m.role,
            role_v2=m.role_v2,
            status=m.status,
            created_at=getattr(m, "created_at", None),
            user_name=u.name,
            user_email=u.email,
            access_profile=m.access_profile,
        )
        for m, u in mem_rows
    ]

    return TenantDetail(
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
        license=_to_license_status(org.license_key),
    )


# ─── Create Tenant (Wizard) — admin-tenant.routes.ts:133-272 ─────────


@router.post("/", response_model=TenantCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantCreateResponse:
    """租户创建向导. 镜像 admin-tenant.routes.ts:133-272.

    流程: org 创建 → license 颁发 (stub) → admin 用户 (3 策略) → 加 admin 为 org_admin
    member → 可选 EAP partnership.

    admin 用户三种情况 (Node 注释 198-203):
      (a) admin.user_id 给了 → 链接已有 user
      (b) 邮箱已存在 → 复用已有 user, 不重置密码 (避免接管攻击)
      (c) 邮箱没在 users 表 → 新建 user
    """
    _require_system_admin(user)

    # ── 1. Validate org ────────────────────────────────────────────
    name = body.org.name.strip()
    slug = body.org.slug.strip()
    if not name or not slug:
        raise ValidationError("机构名称和标识不能为空")
    if not _SLUG_RE.match(slug):
        raise ValidationError("标识只能包含小写字母、数字和连字符")

    # slug uniqueness
    exists_q = select(Organization.id).where(Organization.slug == slug).limit(1)
    if (await db.execute(exists_q)).scalar_one_or_none() is not None:
        raise ValidationError(f"标识 '{slug}' 已存在")

    # ── 2. Validate subscription ───────────────────────────────────
    sub = body.subscription
    if sub.tier not in VALID_TIERS:
        raise ValidationError(f"套餐等级无效，可选: {', '.join(VALID_TIERS)}")
    plan = _PLAN_MAP.get(sub.tier, "free")

    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    # ── 3. Create org + license + admin user + member 单 transaction ─
    try:
        org = Organization(
            name=name,
            slug=slug,
            plan=plan,
            settings=body.settings or {},
            triage_config=DEFAULT_TRIAGE_CONFIG,
        )
        db.add(org)
        await db.flush()  # 取 org.id

        # 4. Sign license (Phase 3 stub)
        try:
            issued_at = datetime.now(UTC)
            expires_at = issued_at + timedelta(days=30 * sub.months)
            token = _stub_token_payload(
                org_id=str(org.id),
                tier=sub.tier,
                max_seats=sub.max_seats,
                expires_at=expires_at,
                issued_at=issued_at,
            )
            org.license_key = token
        except Exception as exc:
            # Node 端 'License signing failed' 是 console.warn 不致命; Python 也允许.
            import logging

            logging.getLogger(__name__).warning("License signing failed: %s", exc)

        # 5. Admin 用户 — 三种策略
        admin_info = body.admin
        admin_user_id: Any = None

        if admin_info.user_id:
            u_uuid = parse_uuid_or_raise(admin_info.user_id, field="adminUserId")
            u_q = select(User.id).where(User.id == u_uuid).limit(1)
            existing = (await db.execute(u_q)).scalar_one_or_none()
            if existing is None:
                raise ValidationError("指定的管理员用户不存在")
            admin_user_id = u_uuid
        else:
            if not admin_info.email or not admin_info.name:
                raise ValidationError("创建新管理员需要邮箱和姓名")
            email_norm = admin_info.email.strip().lower()
            existing_q = select(User).where(User.email == email_norm).limit(1)
            existing_user = (await db.execute(existing_q)).scalar_one_or_none()

            if existing_user is not None:
                # 复用 — 不重置密码 (与 Node 注释 198-203 一致)
                admin_user_id = existing_user.id
            else:
                if not admin_info.password:
                    raise ValidationError("新建管理员需要密码")
                if len(admin_info.password) < 6:
                    raise ValidationError("密码至少 6 位")
                new_admin = User(
                    email=email_norm,
                    name=admin_info.name,
                    password_hash=hash_password(admin_info.password),
                )
                db.add(new_admin)
                await db.flush()
                admin_user_id = new_admin.id

        # 6. Add admin as org_admin member
        member = OrgMember(
            org_id=org.id,
            user_id=admin_user_id,
            role="org_admin",
            status="active",
        )
        db.add(member)

        # 7. EAP partnership (可选, 只 enterprise orgType 走)
        created_org_type = (body.settings or {}).get("orgType") if body.settings else None
        if body.provider_org_id and created_org_type == "enterprise":
            provider_uuid = parse_uuid_or_raise(body.provider_org_id, field="providerOrgId")
            prov_q = select(Organization.id).where(Organization.id == provider_uuid).limit(1)
            if (await db.execute(prov_q)).scalar_one_or_none() is not None:
                db.add(
                    EAPPartnership(
                        enterprise_org_id=org.id,
                        provider_org_id=provider_uuid,
                        status="active",
                        created_by=user_uuid,
                    )
                )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="tenant.created",
        resource="organization",
        resource_id=str(org.id),
        ip_address=request.client.host if request.client else None,
    )

    return TenantCreateResponse(org_id=str(org.id))


# ─── Add Member — admin-tenant.routes.ts:275-345 ─────────────────────


@router.post(
    "/{org_id}/members",
    response_model=TenantMemberAddResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_tenant_member(
    org_id: str,
    body: TenantMemberAddRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantMemberAddResponse:
    """sysadm 直接加 member (与 invite 不同, 这里不做 seat-limit / pending 状态).

    镜像 admin-tenant.routes.ts:275-345. user 三种策略与 create_tenant 一致.
    """
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    org_q = select(Organization.id).where(Organization.id == org_uuid).limit(1)
    if (await db.execute(org_q)).scalar_one_or_none() is None:
        raise NotFoundError("Organization", org_id)

    role = body.role if (body.role and body.role in VALID_ROLES) else "counselor"

    target_user_id: Any
    reused_existing_user = False

    if body.user_id:
        u_uuid = parse_uuid_or_raise(body.user_id, field="userId")
        u_q = select(User.id).where(User.id == u_uuid).limit(1)
        if (await db.execute(u_q)).scalar_one_or_none() is None:
            raise ValidationError("用户不存在")
        target_user_id = u_uuid
        reused_existing_user = True
    else:
        if not body.email or not body.name:
            raise ValidationError("需要邮箱和姓名")
        email_norm = body.email.strip().lower()
        existing_q = select(User).where(User.email == email_norm).limit(1)
        existing = (await db.execute(existing_q)).scalar_one_or_none()
        if existing is not None:
            target_user_id = existing.id
            reused_existing_user = True
        else:
            if not body.password:
                raise ValidationError("新建用户需要密码")
            if len(body.password) < 6:
                raise ValidationError("密码至少 6 位")
            new_user = User(
                email=email_norm,
                name=body.name,
                password_hash=hash_password(body.password),
            )
            db.add(new_user)
            await db.flush()
            target_user_id = new_user.id

    # Dup 检查 — (org_id, user_id) 唯一 (Node admin-tenant.routes.ts:325-333 的修复)
    dup_q = (
        select(OrgMember)
        .where(and_(OrgMember.org_id == org_uuid, OrgMember.user_id == target_user_id))
        .limit(1)
    )
    dup = (await db.execute(dup_q)).scalar_one_or_none()
    if dup is not None:
        raise ValidationError(f"该用户已是本机构成员 (角色: {dup.role}, 状态: {dup.status})")

    member = OrgMember(
        org_id=org_uuid,
        user_id=target_user_id,
        role=role,
        status="active",
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="member.added",
        resource="org_members",
        resource_id=str(member.id),
        ip_address=request.client.host if request.client else None,
    )

    return TenantMemberAddResponse(
        id=str(member.id),
        org_id=str(member.org_id),
        user_id=str(member.user_id),
        role=member.role,
        status=member.status,
        reused_existing_user=reused_existing_user,
    )


# ─── Update Member — admin-tenant.routes.ts:348-392 ──────────────────


@router.patch(
    "/{org_id}/members/{member_id}",
    response_model=TenantMemberPatchResponse,
)
async def patch_tenant_member(
    org_id: str,
    member_id: str,
    body: TenantMemberPatchRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantMemberPatchResponse:
    """改成员 role/status/clinical_practitioner. 镜像 admin-tenant.routes.ts:348-392.

    Phase 1.5 ``clinical_practitioner`` 开关写入 access_profile.dataClasses
    (放开 phi_full 给 clinic_admin 老板兼咨询师场景).
    """
    _require_system_admin(user)

    member_uuid = parse_uuid_or_raise(member_id, field="memberId")
    q = select(OrgMember).where(OrgMember.id == member_uuid).limit(1)
    member = (await db.execute(q)).scalar_one_or_none()
    if member is None:
        raise NotFoundError("Member", member_id)

    has_update = False
    if body.role and body.role in VALID_ROLES:
        member.role = body.role
        has_update = True
    if body.status:
        member.status = body.status
        has_update = True

    if body.clinical_practitioner is not None:
        # Phase 1.5: 写 access_profile.dataClasses (与 Node admin-tenant.routes.ts:362-379 一致)
        profile = dict(member.access_profile or {})
        if body.clinical_practitioner:
            profile["dataClasses"] = ["phi_full", "phi_summary", "de_identified", "aggregate"]
            profile["reason"] = "clinical_practitioner_patch"
            profile["grantedAt"] = datetime.now(UTC).isoformat()
        else:
            profile.pop("dataClasses", None)
            profile.pop("reason", None)
            profile.pop("grantedAt", None)
        member.access_profile = profile
        has_update = True

    if not has_update:
        raise ValidationError("No fields to update")

    await db.commit()

    await record_audit(
        db=db,
        org_id=str(member.org_id),
        user_id=user.id,
        action="member.updated",
        resource="org_members",
        resource_id=str(member.id),
        ip_address=request.client.host if request.client else None,
    )

    return TenantMemberPatchResponse(
        id=str(member.id),
        org_id=str(member.org_id),
        user_id=str(member.user_id),
        role=member.role,
        role_v2=member.role_v2,
        principal_class=member.principal_class,
        access_profile=member.access_profile,
        permissions=member.permissions or {},
        status=member.status,
        full_practice_access=member.full_practice_access,
        created_at=getattr(member, "created_at", None),
    )


# ─── Remove Member — admin-tenant.routes.ts:395-408 ──────────────────


@router.delete(
    "/{org_id}/members/{member_id}",
    response_model=OkResponse,
)
async def remove_tenant_member(
    org_id: str,
    member_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """物理删 member. 镜像 admin-tenant.routes.ts:395-408."""
    _require_system_admin(user)

    member_uuid = parse_uuid_or_raise(member_id, field="memberId")
    q = select(OrgMember).where(OrgMember.id == member_uuid).limit(1)
    member = (await db.execute(q)).scalar_one_or_none()
    if member is None:
        raise NotFoundError("Member", member_id)

    target_org_id = member.org_id
    await db.execute(delete(OrgMember).where(OrgMember.id == member_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(target_org_id),
        user_id=user.id,
        action="member.removed",
        resource="org_members",
        resource_id=str(member_uuid),
        ip_address=request.client.host if request.client else None,
    )
    return OkResponse()


# ─── Update Tenant — admin-tenant.routes.ts:411-445 ──────────────────


@router.patch("/{org_id}", response_model=TenantUpdated)
async def update_tenant(
    org_id: str,
    body: TenantUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantUpdated:
    """更新 name / slug / orgType. 镜像 admin-tenant.routes.ts:411-445."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_id)

    if body.name and body.name.strip():
        org.name = body.name.strip()
    if body.slug and body.slug.strip():
        new_slug = body.slug.strip()
        if not _SLUG_RE.match(new_slug):
            raise ValidationError("标识只能包含小写字母、数字和连字符")
        if new_slug != org.slug:
            dup_q = select(Organization.id).where(Organization.slug == new_slug).limit(1)
            if (await db.execute(dup_q)).scalar_one_or_none() is not None:
                raise ValidationError(f"标识 '{new_slug}' 已存在")
        org.slug = new_slug

    # orgType 走 settings.orgType (merge, 不覆盖其他 settings keys)
    if body.org_type:
        if body.org_type not in ALLOWED_ORG_TYPES:
            raise ValidationError(f"orgType 必须是 {' / '.join(ALLOWED_ORG_TYPES)} 之一")
        current_settings = dict(org.settings or {})
        current_settings["orgType"] = body.org_type
        org.settings = current_settings

    org.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="tenant.updated",
        resource="organization",
        resource_id=str(org.id),
        ip_address=request.client.host if request.client else None,
    )

    return TenantUpdated(
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


# ─── Delete Tenant — admin-tenant.routes.ts:448-460 ──────────────────


@router.delete("/{org_id}", response_model=OkResponse)
async def delete_tenant(
    org_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    """删除租户 (cascade members). 镜像 admin-tenant.routes.ts:448-460.

    与 Node 一致: 先删 org_members, 再删 organizations (ORM cascade 在 schema 定义,
    但显式删保险, Drizzle 端注释说 'cascade may not cover all FKs').
    """
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    org_q = select(Organization.id).where(Organization.id == org_uuid).limit(1)
    if (await db.execute(org_q)).scalar_one_or_none() is None:
        raise NotFoundError("Organization", org_id)

    await db.execute(delete(OrgMember).where(OrgMember.org_id == org_uuid))
    await db.execute(delete(Organization).where(Organization.id == org_uuid))
    await db.commit()

    await record_audit(
        db=db,
        org_id=None,
        user_id=user.id,
        action="tenant.deleted",
        resource="organization",
        resource_id=org_id,
        ip_address=request.client.host if request.client else None,
    )
    return OkResponse()


# ─── Per-tenant Service Config ───────────────────────────────────────


@router.get("/{org_id}/services", response_model=TenantServicesResponse)
async def get_tenant_services(
    org_id: str,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantServicesResponse:
    """读 service config (sensitive 字段 mask). 镜像 admin-tenant.routes.ts:463-491."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_id)

    settings = (org.settings or {}) if isinstance(org.settings, dict) else {}
    ai_config = settings.get("aiConfig", {}) or {}
    email_config = settings.get("emailConfig", {}) or {}

    api_key = str(ai_config.get("apiKey") or "")
    smtp_pass_present = bool(email_config.get("smtpPass"))

    return TenantServicesResponse(
        ai_config=AIConfigMasked(
            api_key=f"****{api_key[-4:]}" if api_key else "",
            base_url=str(ai_config.get("baseUrl") or ""),
            model=str(ai_config.get("model") or ""),
            monthly_token_limit=int(ai_config.get("monthlyTokenLimit") or 0),
        ),
        email_config=EmailConfigMasked(
            smtp_host=str(email_config.get("smtpHost") or ""),
            smtp_port=int(email_config.get("smtpPort") or 465),
            smtp_user=str(email_config.get("smtpUser") or ""),
            smtp_pass="****" if smtp_pass_present else "",
            sender_name=str(email_config.get("senderName") or ""),
            sender_email=str(email_config.get("senderEmail") or ""),
        ),
    )


@router.patch("/{org_id}/services", response_model=SuccessResponse)
async def update_tenant_services(
    org_id: str,
    body: TenantServicesUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuccessResponse:
    """更新 service config (apiKey 'masked' 时不覆盖). 镜像 admin-tenant.routes.ts:494-527."""
    _require_system_admin(user)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = select(Organization).where(Organization.id == org_uuid).limit(1)
    org = (await db.execute(q)).scalar_one_or_none()
    if org is None:
        raise NotFoundError("Organization", org_id)

    current_settings = dict(org.settings or {})

    if body.ai_config:
        existing_ai = dict(current_settings.get("aiConfig", {}) or {})
        new_ai = dict(body.ai_config)
        # Don't overwrite apiKey if masked value is sent back
        api_key_in = new_ai.get("apiKey")
        if isinstance(api_key_in, str) and api_key_in.startswith("****"):
            new_ai["apiKey"] = existing_ai.get("apiKey", "")
        existing_ai.update(new_ai)
        current_settings["aiConfig"] = existing_ai

    if body.email_config:
        existing_email = dict(current_settings.get("emailConfig", {}) or {})
        new_email = dict(body.email_config)
        if new_email.get("smtpPass") == "****":
            new_email["smtpPass"] = existing_email.get("smtpPass", "")
        existing_email.update(new_email)
        current_settings["emailConfig"] = existing_email

    org.settings = current_settings
    org.updated_at = datetime.now(UTC)
    await db.commit()

    await record_audit(
        db=db,
        org_id=str(org_uuid),
        user_id=user.id,
        action="tenant.services.updated",
        resource="organization",
        resource_id=str(org_uuid),
        ip_address=request.client.host if request.client else None,
    )

    return SuccessResponse()


__all__ = ["router"]
