"""
Admin API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/admin/{admin,admin-dashboard,admin-library,admin-license,admin-tenant}.routes.ts``
的 JSON shape — Node 端 client 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase (与 ``app/api/v1/_schema_base.CamelModel`` 全局基类对齐)。

涵盖 5 个 sub-router 的全部 schemas (集中在一处, 与 auth/schemas.py / org/schemas.py 风格一致):

  - admin core         (stats / orgs CRUD / users CRUD / config)
  - admin-dashboard    (tiles / trends / alerts / operationalOrgs / recentLicenseActivity)
  - admin-library      (6 类知识库 CRUD + distribution)
  - admin-license      (issue / renew / modify / revoke + listing)
  - admin-tenant       (list / detail / create / members CRUD / update / delete / services)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field

from app.api.v1._schema_base import CamelModel

# ─── 通用信封 ─────────────────────────────────────────────────────


class OkResponse(CamelModel):
    """``{ok: true}`` 信封 (与 admin.routes.ts:198/199/208/263 等多处对齐)。"""

    ok: bool = True


class SuccessResponse(CamelModel):
    """``{success: true}`` 信封 — admin-license/tenant 多处用 success 而非 ok."""

    success: bool = True


# ═══════════════════════════════════════════════════════════════
# admin.routes.ts (主路由 — stats / orgs / users / config)
# ═══════════════════════════════════════════════════════════════


# ─── Platform Stats ────────────────────────────────────────────────


class PlatformStats(CamelModel):
    """``GET /api/admin/stats`` — 镜像 admin.routes.ts:15-24 形状."""

    organizations: int
    users: int
    memberships: int


# ─── Org Management ────────────────────────────────────────────────


class AdminOrgRow(CamelModel):
    """``GET /api/admin/orgs`` 列表项 — 镜像 admin.routes.ts:28-43.

    注: ``memberCount`` 在 Node 端用 ``count(orgMembers.id)`` left-join 算出.
    """

    id: str
    name: str
    slug: str
    plan: str
    created_at: datetime | None = None
    member_count: int = 0


class AdminOrgMemberRow(CamelModel):
    """``GET /api/admin/orgs/{org_id}`` 嵌套 members 行 — admin.routes.ts:50-64."""

    id: str
    user_id: str
    role: str
    status: str
    full_practice_access: bool = False
    supervisor_id: str | None = None
    created_at: datetime | None = None
    user_name: str
    user_email: str | None = None


class AdminOrgDetail(CamelModel):
    """``GET /api/admin/orgs/{org_id}`` — org 全字段 + members 数组."""

    id: str
    name: str
    slug: str
    plan: str
    license_key: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    triage_config: dict[str, Any] = Field(default_factory=dict)
    data_retention_policy: dict[str, Any] | None = None
    parent_org_id: str | None = None
    org_level: str = "leaf"
    created_at: datetime | None = None
    updated_at: datetime | None = None
    members: list[AdminOrgMemberRow] = Field(default_factory=list)


class AdminOrgUpdateRequest(CamelModel):
    """``PATCH /api/admin/orgs/{org_id}`` — 部分字段更新 (admin.routes.ts:69-74)."""

    plan: str | None = None
    settings: dict[str, Any] | None = None


class AdminOrgUpdated(CamelModel):
    """``PATCH .../orgs/{org_id}`` 返回 — 全字段 (Node returning())."""

    id: str
    name: str
    slug: str
    plan: str
    license_key: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    triage_config: dict[str, Any] = Field(default_factory=dict)
    data_retention_policy: dict[str, Any] | None = None
    parent_org_id: str | None = None
    org_level: str = "leaf"
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── User Management ───────────────────────────────────────────────


class AdminUserRow(CamelModel):
    """``GET /api/admin/users`` 列表项 — admin.routes.ts:82-95."""

    id: str
    email: str | None = None
    name: str
    is_system_admin: bool = False
    created_at: datetime | None = None
    org_count: int = 0


class AdminUserMembership(CamelModel):
    """``GET /api/admin/users/{user_id}`` 嵌套 memberships 行 — admin.routes.ts:117-127."""

    id: str
    org_id: str
    role: str
    status: str
    full_practice_access: bool = False
    supervisor_id: str | None = None
    created_at: datetime | None = None
    org_name: str
    org_slug: str
    org_plan: str


class AdminUserDetail(CamelModel):
    """``GET /api/admin/users/{user_id}`` — admin.routes.ts:131-139."""

    id: str
    email: str | None = None
    name: str
    is_system_admin: bool = False
    created_at: datetime | None = None
    memberships: list[AdminUserMembership] = Field(default_factory=list)


class AdminUserCreateRequest(CamelModel):
    """``POST /api/admin/users`` body — admin.routes.ts:144-149."""

    email: EmailStr
    name: str = Field(min_length=1)
    password: str = Field(min_length=6)
    is_system_admin: bool | None = False


class AdminUserCreated(CamelModel):
    """``POST .../users`` 201 返回 — admin.routes.ts:163-169."""

    id: str
    email: str | None = None
    name: str
    is_system_admin: bool = False
    created_at: datetime | None = None


class AdminUserUpdateRequest(CamelModel):
    """``PATCH /api/admin/users/{user_id}`` body — admin.routes.ts:174-178."""

    name: str | None = None
    is_system_admin: bool | None = None


class AdminUserResetPasswordRequest(CamelModel):
    """``POST /api/admin/users/{user_id}/reset-password`` — admin.routes.ts:191-198."""

    password: str = Field(min_length=6)


class AdminUserToggleStatusRequest(CamelModel):
    """``POST /api/admin/users/{user_id}/toggle-status`` — admin.routes.ts:202-208."""

    disabled: bool


class AdminUserToggleStatusResponse(CamelModel):
    """``POST .../toggle-status`` 返回 — admin.routes.ts:208."""

    ok: bool = True
    status: str  # 'active' | 'disabled'


# ─── System Config ─────────────────────────────────────────────────

# config endpoint 直接返回 raw dict (动态 6 category) — 走 dict[str, Any] 即可
SystemConfigPayload = dict[str, Any]


# ═══════════════════════════════════════════════════════════════
# admin-dashboard.routes.ts
# ═══════════════════════════════════════════════════════════════


class DashboardTiles(CamelModel):
    """admin-dashboard.routes.ts:222-227 — 4 个顶部 tile."""

    active_tenants: int
    monthly_active_users: int
    monthly_care_episodes: int
    expiring_licenses: int


class TenantGrowthPoint(CamelModel):
    month: str
    count: int


class UserActivityPoint(CamelModel):
    month: str
    active_users: int


class DashboardTrends(CamelModel):
    """admin-dashboard.routes.ts:228-237 — 12-month + 6-month 折线."""

    tenant_growth: list[TenantGrowthPoint] = Field(default_factory=list)
    user_activity: list[UserActivityPoint] = Field(default_factory=list)


class ExpiringLicenseAlert(CamelModel):
    """admin-dashboard.routes.ts:239-243."""

    org_id: str
    org_name: str
    expires_at: str | None = None


class RecentLicenseActivity(CamelModel):
    """admin-dashboard.routes.ts:152-157."""

    action: str
    org_id: str | None = None
    org_name: str
    created_at: str  # ISO8601


class OperationalOrg(CamelModel):
    """admin-dashboard.routes.ts:197-213."""

    org_id: str
    org_name: str
    slug: str
    active_member_count: int = 0
    monthly_episodes: int = 0
    tier: str | None = None
    license_status: str = "none"
    license_expires_at: str | None = None
    last_activity_at: str | None = None


class DashboardAlerts(CamelModel):
    """admin-dashboard.routes.ts:238-247."""

    expired_license_orgs: list[ExpiringLicenseAlert] = Field(default_factory=list)
    recent_license_activity: list[RecentLicenseActivity] = Field(default_factory=list)
    operational_orgs: list[OperationalOrg] = Field(default_factory=list)


class DashboardResponse(CamelModel):
    """``GET /api/admin/dashboard`` — admin-dashboard.routes.ts:221-249."""

    tiles: DashboardTiles
    trends: DashboardTrends
    alerts: DashboardAlerts


# ═══════════════════════════════════════════════════════════════
# admin-library.routes.ts (6 类知识库 CRUD + distribution)
# ═══════════════════════════════════════════════════════════════


class LibraryDistributionRequest(CamelModel):
    """``PATCH /api/admin/library/{type}/{id}/distribution`` — admin-library.routes.ts:502-521.

    type ∈ {scales, courses, schemes, templates, goals, agreements}.
    """

    allowed_org_ids: list[str] = Field(default_factory=list)


class LibraryDistributionResponse(CamelModel):
    ok: bool = True
    allowed_org_ids: list[str] = Field(default_factory=list)


# admin-library 各类 CRUD 大量返回 raw row (Drizzle ``.returning()``) —
# 用 dict[str, Any] 透传比逐字段 schema 维护成本低很多, 与 Node 行为等价.
LibraryItem = dict[str, Any]


# ═══════════════════════════════════════════════════════════════
# admin-license.routes.ts
# ═══════════════════════════════════════════════════════════════


class LicenseStatusInfo(CamelModel):
    """admin-license.routes.ts:66-72 嵌套 license 子结构."""

    status: str  # 'active' | 'expired' | 'invalid' | 'none'
    tier: str | None = None
    max_seats: int | None = None
    expires_at: str | None = None
    issued_at: str | None = None


class LicenseListRow(CamelModel):
    """``GET /api/admin/licenses`` 列表项 — admin-license.routes.ts:60-73."""

    org_id: str
    org_name: str
    org_slug: str
    plan: str
    member_count: int = 0
    license: LicenseStatusInfo


class LicenseIssueRequest(CamelModel):
    """``POST /api/admin/licenses/issue`` body — admin-license.routes.ts:82-89."""

    org_id: str = Field(min_length=1)
    tier: str = Field(min_length=1)  # starter | growth | flagship
    max_seats: int = Field(ge=1)
    months: int = Field(ge=1, le=120)
    valid_from: str | None = None  # ISO date


class LicenseRenewRequest(CamelModel):
    """``POST /api/admin/licenses/renew`` body — admin-license.routes.ts:135."""

    org_id: str = Field(min_length=1)
    months: int = Field(ge=1, le=120)


class LicenseModifyRequest(CamelModel):
    """``POST /api/admin/licenses/modify`` body — admin-license.routes.ts:178-181."""

    org_id: str = Field(min_length=1)
    tier: str | None = None
    max_seats: int | None = Field(default=None, ge=1)


class LicenseRevokeRequest(CamelModel):
    """``POST /api/admin/licenses/revoke`` body — admin-license.routes.ts:217-220."""

    org_id: str = Field(min_length=1)


class LicenseIssueResponse(CamelModel):
    """``POST /api/admin/licenses/issue`` / ``renew`` / ``modify`` 返回.

    Phase 3 stub: ``token`` 持久化 ``license_key`` (Phase 5 接 RSA 签名).
    """

    success: bool = True
    token: str
    tier: str
    max_seats: int
    expires_at: str
    issued_at: str


# ═══════════════════════════════════════════════════════════════
# admin-tenant.routes.ts
# ═══════════════════════════════════════════════════════════════


class TenantListRow(CamelModel):
    """``GET /api/admin/tenants`` 列表项 — admin-tenant.routes.ts:69-86."""

    id: str
    name: str
    slug: str
    plan: str
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    member_count: int = 0
    org_type: str = "counseling"
    is_enterprise: bool = False
    partnership_count: int = 0
    license: LicenseStatusInfo


class TenantMemberRow(CamelModel):
    """``GET /api/admin/tenants/{org_id}`` 嵌套 members — admin-tenant.routes.ts:99-110."""

    id: str
    user_id: str
    role: str
    role_v2: str | None = None
    status: str
    created_at: datetime | None = None
    user_name: str
    user_email: str | None = None
    access_profile: dict[str, Any] | None = None


class TenantDetail(CamelModel):
    """``GET /api/admin/tenants/{org_id}`` — admin-tenant.routes.ts:119-129."""

    id: str
    name: str
    slug: str
    plan: str
    license_key: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    triage_config: dict[str, Any] = Field(default_factory=dict)
    data_retention_policy: dict[str, Any] | None = None
    parent_org_id: str | None = None
    org_level: str = "leaf"
    created_at: datetime | None = None
    updated_at: datetime | None = None
    members: list[TenantMemberRow] = Field(default_factory=list)
    license: LicenseStatusInfo


class TenantOrgInfo(CamelModel):
    """``POST /api/admin/tenants`` body 内嵌 org 字段."""

    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)


class TenantSubscription(CamelModel):
    tier: str = Field(min_length=1)
    max_seats: int = Field(ge=1)
    months: int = Field(ge=1, le=120)


class TenantAdminInfo(CamelModel):
    """新建 / 复用 admin 用户的三种策略 (见 Node 注释 admin-tenant.routes.ts:198-203)."""

    user_id: str | None = None
    email: EmailStr | None = None
    name: str | None = None
    password: str | None = None


class TenantCreateRequest(CamelModel):
    """``POST /api/admin/tenants`` — admin-tenant.routes.ts:134-140."""

    org: TenantOrgInfo
    subscription: TenantSubscription
    admin: TenantAdminInfo
    settings: dict[str, Any] | None = None
    provider_org_id: str | None = None  # EAP enterprise → 服务方


class TenantCreateResponse(CamelModel):
    """``POST /api/admin/tenants`` 201 — admin-tenant.routes.ts:271."""

    org_id: str


class TenantMemberAddRequest(CamelModel):
    """``POST /api/admin/tenants/{org_id}/members`` — admin-tenant.routes.ts:277-283."""

    user_id: str | None = None
    email: EmailStr | None = None
    name: str | None = None
    password: str | None = None
    role: str | None = None  # org_admin | counselor | client


class TenantMemberAddResponse(CamelModel):
    """``POST .../members`` 201 — admin-tenant.routes.ts:344."""

    id: str
    org_id: str
    user_id: str
    role: str
    status: str
    reused_existing_user: bool = False


class TenantMemberPatchRequest(CamelModel):
    """``PATCH /api/admin/tenants/{org_id}/members/{member_id}`` — admin-tenant.routes.ts:350-355."""

    role: str | None = None
    status: str | None = None
    clinical_practitioner: bool | None = None  # Phase 1.5 单点放开 phi_full


class TenantMemberPatchResponse(CamelModel):
    """``PATCH .../members/{member_id}`` 返回 — 全字段.

    与 ``MemberUpdated`` 同形, 但放在 admin.schemas 避免跨模块 import.
    """

    id: str
    org_id: str
    user_id: str
    role: str
    role_v2: str | None = None
    principal_class: str | None = None
    access_profile: dict[str, Any] | None = None
    permissions: dict[str, Any] = Field(default_factory=dict)
    status: str = "active"
    full_practice_access: bool = False
    created_at: datetime | None = None


class TenantUpdateRequest(CamelModel):
    """``PATCH /api/admin/tenants/{org_id}`` — admin-tenant.routes.ts:411-413."""

    name: str | None = None
    slug: str | None = None
    org_type: str | None = None  # solo | counseling | enterprise | school | hospital


class TenantUpdated(CamelModel):
    """``PATCH /api/admin/tenants/{org_id}`` 返回 — Node returning()."""

    id: str
    name: str
    slug: str
    plan: str
    license_key: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    triage_config: dict[str, Any] = Field(default_factory=dict)
    data_retention_policy: dict[str, Any] | None = None
    parent_org_id: str | None = None
    org_level: str = "leaf"
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Per-tenant Service Config ─────────────────────────────────────


class AIConfigMasked(CamelModel):
    """admin-tenant.routes.ts:476-481 — apiKey 末 4 字符显示."""

    api_key: str = ""  # masked '****abcd' or empty
    base_url: str = ""
    model: str = ""
    monthly_token_limit: int = 0


class EmailConfigMasked(CamelModel):
    """admin-tenant.routes.ts:482-489 — smtpPass 永远 '****'."""

    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_pass: str = ""  # '****' or empty
    sender_name: str = ""
    sender_email: str = ""


class TenantServicesResponse(CamelModel):
    """``GET /api/admin/tenants/{org_id}/services`` — admin-tenant.routes.ts:475-490."""

    ai_config: AIConfigMasked
    email_config: EmailConfigMasked


class TenantServicesUpdateRequest(CamelModel):
    """``PATCH /api/admin/tenants/{org_id}/services`` — admin-tenant.routes.ts:495-496."""

    ai_config: dict[str, Any] | None = None
    email_config: dict[str, Any] | None = None


__all__ = [
    "AIConfigMasked",
    "AdminOrgDetail",
    "AdminOrgMemberRow",
    "AdminOrgRow",
    "AdminOrgUpdateRequest",
    "AdminOrgUpdated",
    "AdminUserCreateRequest",
    "AdminUserCreated",
    "AdminUserDetail",
    "AdminUserMembership",
    "AdminUserResetPasswordRequest",
    "AdminUserRow",
    "AdminUserToggleStatusRequest",
    "AdminUserToggleStatusResponse",
    "AdminUserUpdateRequest",
    "DashboardAlerts",
    "DashboardResponse",
    "DashboardTiles",
    "DashboardTrends",
    "EmailConfigMasked",
    "ExpiringLicenseAlert",
    "LibraryDistributionRequest",
    "LibraryDistributionResponse",
    "LibraryItem",
    "LicenseIssueRequest",
    "LicenseIssueResponse",
    "LicenseListRow",
    "LicenseModifyRequest",
    "LicenseRenewRequest",
    "LicenseRevokeRequest",
    "LicenseStatusInfo",
    "OkResponse",
    "OperationalOrg",
    "PlatformStats",
    "RecentLicenseActivity",
    "SuccessResponse",
    "SystemConfigPayload",
    "TenantAdminInfo",
    "TenantCreateRequest",
    "TenantCreateResponse",
    "TenantDetail",
    "TenantGrowthPoint",
    "TenantListRow",
    "TenantMemberAddRequest",
    "TenantMemberAddResponse",
    "TenantMemberPatchRequest",
    "TenantMemberPatchResponse",
    "TenantMemberRow",
    "TenantOrgInfo",
    "TenantServicesResponse",
    "TenantServicesUpdateRequest",
    "TenantSubscription",
    "TenantUpdateRequest",
    "TenantUpdated",
    "UserActivityPoint",
]
