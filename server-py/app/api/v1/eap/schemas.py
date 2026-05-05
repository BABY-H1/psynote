"""
EAP API 请求 / 响应 schemas (Pydantic v2)。

镜像 ``server/src/modules/eap/`` 下 5 个 routes 文件
(eap-partnership / eap-assignment / eap-analytics / eap-public) 的 JSON shape。
client / portal 仍调旧合约 (camelCase), 故所有 schema 走
``alias_generator=to_camel`` + ``populate_by_name=True``: 内部 Python 用 snake_case,
JSON wire 用 camelCase。

涵盖:
  - partnership (CRUD + assignment 计数 + 详情)
  - assignment (列表 + 创建 + 删除)
  - analytics (overview / todos / usage-trend / risk-distribution / department) — HR 聚合数据
  - public (info + register, no auth, W0.4 安全注册)

⚠ HR 不能直读 PHI 硬隔离: analytics 端点全部走 ``eap_usage_events`` 聚合,
   不返回 individual 数据 (k-anonymity k>=5 + department merge into '其他')。
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field

from app.api.v1._schema_base import CamelModel
from app.lib.phone_utils import CN_PHONE_REGEX

# ─── 通用 ─────────────────────────────────────────────────────


class OkResponse(CamelModel):
    """统一 OK 信封 (镜像 Node ``{ok: true}``)。"""

    ok: bool = True


class SuccessResponse(CamelModel):
    """``{success: true}`` 信封."""

    success: bool = True


# ─── Partnership ─────────────────────────────────────────────────


class PartnerOrgInfo(CamelModel):
    """合作机构基本信息 (合作对端的 name / slug)."""

    name: str
    slug: str


class PartnershipRow(CamelModel):
    """``GET /`` 列表项 + ``GET /:id`` 详情中的 partnership 主体.

    镜像 eap-partnership.routes.ts:65-69 的形状 (含派生 ``role`` / ``partnerOrg`` / ``assignedCounselorCount``).
    """

    id: str
    enterprise_org_id: str
    provider_org_id: str
    status: str
    contract_start: datetime | None = None
    contract_end: datetime | None = None
    seat_allocation: int | None = None
    service_scope: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    role: str  # 'enterprise' | 'provider' (相对当前 org)
    partner_org: PartnerOrgInfo
    assigned_counselor_count: int = 0


class PartnershipListResponse(CamelModel):
    """``GET /`` 响应."""

    partnerships: list[PartnershipRow]


class PartnershipCreateRequest(CamelModel):
    """``POST /`` body. 镜像 eap-partnership.routes.ts:79-86."""

    provider_org_id: str = Field(min_length=1)
    contract_start: str | None = None
    contract_end: str | None = None
    seat_allocation: int | None = None
    service_scope: dict[str, Any] | None = None
    notes: str | None = None


class PartnershipPlain(CamelModel):
    """无 ``role`` / ``partnerOrg`` / ``assignedCounselorCount`` 派生的 raw 形态.

    用于 ``POST /`` (创建后立即返回, 还没装饰) 和 ``PATCH /:id`` 的响应.
    """

    id: str
    enterprise_org_id: str
    provider_org_id: str
    status: str
    contract_start: datetime | None = None
    contract_end: datetime | None = None
    seat_allocation: int | None = None
    service_scope: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PartnershipCreateResponse(CamelModel):
    """``POST /`` 201 响应."""

    partnership: PartnershipPlain


class PartnershipUpdateRequest(CamelModel):
    """``PATCH /:id`` body — 全字段可选. 镜像 eap-partnership.routes.ts:195-202."""

    status: str | None = None
    contract_start: str | None = None
    contract_end: str | None = None
    seat_allocation: int | None = None
    service_scope: dict[str, Any] | None = None
    notes: str | None = None


class PartnershipUpdateResponse(CamelModel):
    """``PATCH /:id`` 响应."""

    partnership: PartnershipPlain


class PartnershipAssignmentEntry(CamelModel):
    """详情中的单个 assignment 行 (含 counselor user 的 name/email)."""

    id: str
    counselor_user_id: str
    status: str
    assigned_at: datetime | None = None
    counselor_name: str | None = None
    counselor_email: str | None = None


class PartnershipDetailResponse(CamelModel):
    """``GET /:id`` 响应 — partnership + 已派遣 assignments."""

    partnership: PartnershipRow
    assignments: list[PartnershipAssignmentEntry]


# ─── Assignment ──────────────────────────────────────────────────


class AssignmentRow(CamelModel):
    """``GET /`` 列表项. 镜像 eap-assignment.routes.ts:52-64."""

    id: str
    partnership_id: str
    counselor_user_id: str
    enterprise_org_id: str
    status: str
    assigned_at: datetime | None = None
    counselor_name: str | None = None
    counselor_email: str | None = None


class AssignmentListResponse(CamelModel):
    """``GET /`` 响应."""

    assignments: list[AssignmentRow]


class AssignmentCreateRequest(CamelModel):
    """``POST /`` body. 镜像 eap-assignment.routes.ts:72-75."""

    partnership_id: str = Field(min_length=1)
    counselor_user_id: str = Field(min_length=1)


class AssignmentPlain(CamelModel):
    """``POST /`` 201 响应中的 assignment 主体."""

    id: str
    partnership_id: str
    counselor_user_id: str
    enterprise_org_id: str
    provider_org_id: str
    status: str
    assigned_at: datetime | None = None
    assigned_by: str | None = None
    removed_at: datetime | None = None


class AssignmentCreateResponse(CamelModel):
    """``POST /`` 201 响应."""

    assignment: AssignmentPlain


# ─── Analytics (HR aggregate, NO PHI) ────────────────────────────


class OverviewResponse(CamelModel):
    """``GET /overview`` 响应 — KPI tiles (HR 主页). 镜像 eap-analytics.routes.ts:68-77.

    Phase 14d ``?month=current`` 过滤当月; 默认累计.
    """

    total_employees: int
    assessments_completed: int
    sessions_booked: int
    sessions_completed: int
    courses_enrolled: int
    groups_participated: int
    crisis_flags: int
    month_only: bool = False


class TodosResponse(CamelModel):
    """``GET /todos`` 响应 — HR 三档待办 (Phase 14d). 镜像 eap-analytics.routes.ts:127-132."""

    open_crisis_count: int
    pending_employee_bind_count: int
    subscription_ends_in_days: int | None = None
    subscription_ends_at: str | None = None


class UsageTrendPeriod(CamelModel):
    days: int
    since: str


class UsageTrendItem(CamelModel):
    date: date_type
    type: str
    count: int


class UsageTrendResponse(CamelModel):
    """``GET /usage-trend`` 响应 — 时间序列分组. 镜像 eap-analytics.routes.ts:158-166."""

    period: UsageTrendPeriod
    data: list[UsageTrendItem]


class RiskDistEntry(CamelModel):
    level: str
    count: int


class RiskDistributionResponse(CamelModel):
    """``GET /risk-distribution`` 响应. 镜像 eap-analytics.routes.ts:185-191."""

    distribution: list[RiskDistEntry]


class DepartmentEntry(CamelModel):
    """单个部门聚合行 — k-anonymity k>=5 enforced."""

    name: str
    employee_count: int
    risk_distribution: dict[str, int] = Field(default_factory=dict)


class DepartmentResponse(CamelModel):
    """``GET /department`` 响应 — k-anonymity merge into '其他'. 镜像 eap-analytics.routes.ts:269."""

    departments: list[DepartmentEntry]


# ─── Public (no auth, employee self-register) ────────────────────


class PublicDepartmentEntry(CamelModel):
    id: str
    name: str


class PublicOrgInfoResponse(CamelModel):
    """``GET /:org_slug/info`` 响应 — 企业 EAP 主页基本信息.

    镜像 eap-public.routes.ts:66-75.
    """

    name: str
    slug: str
    logo_url: str | None = None
    theme_color: str | None = None
    departments: list[PublicDepartmentEntry] = Field(default_factory=list)


class PublicRegisterRequest(CamelModel):
    """``POST /:org_slug/register`` body. 镜像 eap-public.routes.ts:81-87.

    Phase 5 (2026-05-04): 国内市场切手机号, phone 必填 (中国大陆 11 位),
    email 可选 (留作通知 / legacy 兼容)。
    """

    name: str = Field(min_length=1)
    phone: str = Field(pattern=CN_PHONE_REGEX)
    email: EmailStr | None = None
    password: str = Field(min_length=1)
    employee_id: str | None = None
    department: str | None = None


class PublicRegisterResponse(CamelModel):
    """``POST /:org_slug/register`` 201 响应.

    W2.10 (security audit 2026-05-03): 'registered' 是统一 status, 不暴露
    "已是成员" vs "新加入" 的差异 (防 email enumeration).
    """

    status: str = "registered"
    org_id: str
    is_new_user: bool


__all__ = [
    "AssignmentCreateRequest",
    "AssignmentCreateResponse",
    "AssignmentListResponse",
    "AssignmentPlain",
    "AssignmentRow",
    "DepartmentEntry",
    "DepartmentResponse",
    "OkResponse",
    "OverviewResponse",
    "PartnerOrgInfo",
    "PartnershipAssignmentEntry",
    "PartnershipCreateRequest",
    "PartnershipCreateResponse",
    "PartnershipDetailResponse",
    "PartnershipListResponse",
    "PartnershipPlain",
    "PartnershipRow",
    "PartnershipUpdateRequest",
    "PartnershipUpdateResponse",
    "PublicDepartmentEntry",
    "PublicOrgInfoResponse",
    "PublicRegisterRequest",
    "PublicRegisterResponse",
    "RiskDistEntry",
    "RiskDistributionResponse",
    "SuccessResponse",
    "TodosResponse",
    "UsageTrendItem",
    "UsageTrendPeriod",
    "UsageTrendResponse",
]
