"""
Org API 请求 / 响应 schemas (Pydantic v2)。

镜像 server/src/modules/org/{org,public-services,dashboard,branding,subscription,license}.routes.ts
的 JSON shape — client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase。

涵盖 6 个 sub-router 的全部 schemas (集中在一处, 与 auth/schemas.py 风格一致):
  - org core (CRUD + invite + member edit + transfer-cases + triage-config)
  - public-services (orgType-agnostic intake)
  - dashboard (stats + kpi-delta)
  - branding (logo / themeColor / report headers)
  - subscription (tier + features + license)
  - license (activate + remove)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """所有 org schema 的基类 — wire camelCase, Python snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # 防 dump 时多写 alias key (e.g. 既 access_token 又 accessToken)
        serialize_by_alias=True,
    )


# ─── 通用 ─────────────────────────────────────────────────────────


class OkResponse(_CamelModel):
    """统一 OK 信封 (镜像 Node ``{ok: true}`` 或 ``{success: true}``)。"""

    ok: bool = True


class SuccessResponse(_CamelModel):
    """``{success: true}`` 信封 — Node 部分端点用 ``success`` 而非 ``ok``。"""

    success: bool = True


# ─── org core CRUD ───────────────────────────────────────────────


class OrgCreateRequest(_CamelModel):
    """``POST /api/orgs/`` (system admin only). 镜像 org.routes.ts:42-79。"""

    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)


class OrgUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}`` 部分字段更新 (org_admin only)."""

    name: str | None = None
    settings: dict[str, Any] | None = None


class OrgSummary(_CamelModel):
    """``GET /api/orgs/`` 列表项 — org 全字段 + 当前用户在该 org 的角色/状态。

    镜像 org.routes.ts:34-38 的形状。
    """

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
    my_role: str
    my_status: str


class OrgDetail(_CamelModel):
    """``GET /api/orgs/{org_id}`` / ``PATCH`` / ``POST`` 单个 org 详情。"""

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


# ─── members (CRUD + invite + transfer-cases) ─────────────────────


class MemberInviteRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/members/invite`` body."""

    email: EmailStr
    role: str = Field(min_length=1)
    name: str | None = None


class MemberInviteResponse(_CamelModel):
    """``POST .../invite`` 201 返回, 镜像 org.routes.ts:203-210."""

    id: str
    user_id: str
    email: str | None
    name: str
    role: str
    status: str


class MemberSelfUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}/members/me`` (Phase 14f) — 仅 bio/specialties/certifications."""

    bio: str | None = None
    specialties: list[str] | None = None
    certifications: list[Any] | None = None


class MemberAdminUpdateRequest(_CamelModel):
    """``PATCH /api/orgs/{org_id}/members/{member_id}`` 全字段 (admin only)."""

    role: str | None = None
    status: str | None = None
    permissions: dict[str, Any] | None = None
    supervisor_id: str | None = None
    full_practice_access: bool | None = None
    certifications: list[Any] | None = None
    specialties: list[str] | None = None
    max_caseload: int | None = None
    bio: str | None = None


class MemberRow(_CamelModel):
    """``GET .../members`` 列表项 — member + user join 后的扁平形状,
    镜像 org.routes.ts:129-146。"""

    id: str
    user_id: str
    email: str | None
    name: str
    avatar_url: str | None = None
    role: str
    status: str
    permissions: dict[str, Any] = Field(default_factory=dict)
    valid_until: datetime | None = None
    supervisor_id: str | None = None
    full_practice_access: bool = False
    certifications: list[Any] = Field(default_factory=list)
    specialties: list[str] = Field(default_factory=list)
    max_caseload: int | None = None
    bio: str | None = None
    created_at: datetime | None = None


class MemberUpdated(_CamelModel):
    """``PATCH .../members/{id}`` 与 ``PATCH .../members/me`` 都返回 OrgMember 全字段。"""

    id: str
    org_id: str
    user_id: str
    role: str
    role_v2: str | None = None
    principal_class: str | None = None
    access_profile: dict[str, Any] | None = None
    permissions: dict[str, Any] = Field(default_factory=dict)
    status: str = "active"
    valid_until: datetime | None = None
    supervisor_id: str | None = None
    full_practice_access: bool = False
    source_partnership_id: str | None = None
    certifications: list[Any] | None = None
    specialties: list[str] | None = None
    max_caseload: int | None = None
    bio: str | None = None
    created_at: datetime | None = None


class TransferEntry(_CamelModel):
    """单个 transfer 条目 (clientId 转给 toCounselorId)."""

    client_id: str
    to_counselor_id: str


class TransferCasesRequest(_CamelModel):
    """``POST .../members/{member_id}/transfer-cases`` body."""

    transfers: list[TransferEntry] = Field(min_length=1)


class TransferResultEntry(_CamelModel):
    client_id: str
    to_counselor_id: str
    success: bool


class TransferCasesResponse(_CamelModel):
    """``POST .../transfer-cases`` 返回 — 单条转移结果数组 + 成功数。"""

    results: list[TransferResultEntry]
    success_count: int


# ─── triage-config ────────────────────────────────────────────────


# triage_config 内部结构由 packages/shared/triage-config.ts 定义, FastAPI 端
# 仅做 raw JSONB 透传 (Phase 5 加 zod-equivalent Pydantic 校验)。
TriageConfig = dict[str, Any]


# ─── public-services (orgType-agnostic intake) ───────────────────


class PublicServicesResponse(_CamelModel):
    """``GET /api/public/orgs/{org_slug}/services`` (no auth)."""

    org_id: str | None = None
    org_name: str
    services: list[dict[str, Any]] = Field(default_factory=list)


class PublicIntakeRequest(_CamelModel):
    """``POST /api/public/orgs/{org_slug}/services/intake`` (no auth)."""

    service_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    email: EmailStr
    phone: str | None = None
    chief_complaint: str | None = None
    counselor_id: str | None = None  # 来自 ?counselorId= 链接


class PublicIntakeResponse(_CamelModel):
    """``POST .../intake`` 201 返回."""

    intake_id: str
    status: str
    assigned_counselor_id: str | None = None


class IntakeRow(_CamelModel):
    """``GET /api/orgs/{org_id}/service-intakes`` 列表项 (admin)."""

    id: str
    org_id: str
    service_id: str
    client_user_id: str
    preferred_counselor_id: str | None = None
    intake_source: str = "org_portal"
    intake_data: dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"
    assigned_counselor_id: str | None = None
    assigned_at: datetime | None = None
    created_at: datetime | None = None
    client_name: str
    client_email: str | None


class IntakeAssignRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/service-intakes/{intake_id}/assign`` body."""

    counselor_id: str = Field(min_length=1)


# ─── dashboard ────────────────────────────────────────────────────


class DashboardStats(_CamelModel):
    """``GET /api/orgs/{org_id}/dashboard/stats`` 镜像 dashboard.routes.ts:109-117."""

    counselor_count: int
    client_count: int
    monthly_session_count: int
    unassigned_count: int
    active_group_count: int
    active_course_count: int
    monthly_assessment_count: int


class KpiDelta(_CamelModel):
    """单个 KPI 的 current + previous 数对 (kpi-delta 子结构)."""

    current: int
    previous: int


class DashboardKpiDelta(_CamelModel):
    """``GET /api/orgs/{org_id}/dashboard/kpi-delta``  5 个 KPI 镜像 dashboard.routes.ts:238-244."""

    new_client: KpiDelta
    session: KpiDelta
    group_active: KpiDelta
    course_active: KpiDelta
    assessment: KpiDelta


# ─── branding ─────────────────────────────────────────────────────


class BrandingSettings(_CamelModel):
    """``GET / PATCH /api/orgs/{org_id}/branding`` body 与响应同形状.

    镜像 branding.routes.ts:38-43。所有字段 optional, 只更新传入的部分。
    """

    logo_url: str | None = None
    theme_color: str | None = None
    report_header: str | None = None
    report_footer: str | None = None


# ─── subscription ─────────────────────────────────────────────────


class LicenseInfoResponse(_CamelModel):
    """OrgContext.license + seatsUsed 透出形状 (subscription.routes.ts:28-34)."""

    status: str  # 'active' | 'expired' | 'invalid' | 'none'
    max_seats: int | None = None
    expires_at: str | None = None
    seats_used: int


class SubscriptionInfo(_CamelModel):
    """``GET /api/orgs/{org_id}/subscription`` 镜像 SubscriptionInfo interface."""

    tier: str  # OrgTier: 'starter' | 'growth' | 'flagship'
    plan: str  # raw plan from DB
    label: str
    features: list[str]
    license: LicenseInfoResponse


class AIUsageResponse(_CamelModel):
    """``GET /api/orgs/{org_id}/ai-usage`` 当月 AI token 用量."""

    month_start: str  # ISO8601
    monthly_limit: int
    monthly_used: int
    remaining: int | None = None
    percent_used: float | None = None
    call_count: int
    unlimited: bool


# ─── license ──────────────────────────────────────────────────────


class LicenseActivateRequest(_CamelModel):
    """``POST /api/orgs/{org_id}/license`` body — Phase 3 stub 也保形状."""

    license_key: str = Field(min_length=1)


class LicenseActivateResponse(_CamelModel):
    """``POST .../license`` 200 返回 (license.routes.ts:62-69 镜像)."""

    success: bool = True
    tier: str
    label: str
    features: list[str]
    max_seats: int | None = None
    expires_at: str | None = None
