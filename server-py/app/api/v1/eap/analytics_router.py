"""
EAP Analytics router — 镜像 ``server/src/modules/eap/eap-analytics.routes.ts`` (272 行)。

挂在 ``/api/orgs/{org_id}/eap/analytics`` 前缀下。

5 个 endpoint:
  GET /overview           — KPI tiles (HR 主页, ?month=current 过滤当月)
  GET /todos              — 三档待办: open crisis / pending bind / subscription expires
  GET /usage-trend        — 时间序列分组 (?days=N, 默认 30)
  GET /risk-distribution  — 风险等级分布 (assessment_completed events)
  GET /department         — 部门分布 (k-anonymity k>=5, 不足合并入 '其他')

⚠ HR 不能直读 PHI 硬隔离 (合规红线):
  本 router **完全不读** clinical 数据 (assessment_results / care_episodes / session_notes 等).
  所有 endpoint 走 ``eap_usage_events`` (HR 写时自己脱敏的) + 聚合输出.
  individual data 通过 k-anonymity (k>=5 部门合并) 防 re-identification.

RBAC: requireOrgType('enterprise') + requireRole('org_admin') —
  非 enterprise org 直接 403, 非 org_admin 直接 403.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.eap.schemas import (
    DepartmentEntry,
    DepartmentResponse,
    OverviewResponse,
    RiskDistEntry,
    RiskDistributionResponse,
    TodosResponse,
    UsageTrendItem,
    UsageTrendPeriod,
    UsageTrendResponse,
)
from app.core.database import get_db
from app.db.models.eap_crisis_alerts import EAPCrisisAlert
from app.db.models.eap_employee_profiles import EAPEmployeeProfile
from app.db.models.eap_usage_events import EAPUsageEvent
from app.lib.errors import ForbiddenError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()

# k-anonymity 阈值: 部门员工数 < K 时合并入 '其他' (防 re-identification).
# 与 Node K_ANONYMITY = 5 一致.
K_ANONYMITY = 5


def _require_enterprise_admin(org: OrgContext | None) -> OrgContext:
    """``requireOrgType('enterprise') + requireRole('org_admin')`` 等价.

    HR (org_admin) 在 enterprise org 才能看 EAP analytics. 其它一概 403.
    """
    if org is None:
        raise ForbiddenError("org_context_required")
    if org.org_type != "enterprise":
        raise ForbiddenError("eap analytics requires enterprise org")
    if org.role != "org_admin":
        raise ForbiddenError("insufficient_role")
    return org


# ─── Overview KPIs ───────────────────────────────────────────────


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Annotated[str | None, Query()] = None,
) -> OverviewResponse:
    """KPI tiles. 镜像 eap-analytics.routes.ts:38-78.

    ``?month=current`` → 仅过滤当月事件 (本月 XX tile);
    其它 / 不传 → 累计全时间.
    """
    org_ctx = _require_enterprise_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")
    month_only = month == "current"

    # 总员工数 (永不按时间过滤)
    eq = (
        select(func.count())
        .select_from(EAPEmployeeProfile)
        .where(EAPEmployeeProfile.org_id == org_uuid)
    )
    total_employees = (await db.execute(eq)).scalar_one() or 0

    # 事件类型计数 (可选当月过滤)
    conditions = [EAPUsageEvent.enterprise_org_id == org_uuid]
    if month_only:
        # 与 Node ``date_trunc('month', CURRENT_DATE)`` 等价的 SQLAlchemy 表达
        conditions.append(EAPUsageEvent.event_date >= text("date_trunc('month', CURRENT_DATE)"))

    cq = (
        select(EAPUsageEvent.event_type, func.count())
        .where(and_(*conditions))
        .group_by(EAPUsageEvent.event_type)
    )
    rows = (await db.execute(cq)).all()
    count_map: dict[str, int] = {row[0]: int(row[1]) for row in rows}

    return OverviewResponse(
        total_employees=int(total_employees),
        assessments_completed=count_map.get("assessment_completed", 0),
        sessions_booked=count_map.get("session_booked", 0),
        sessions_completed=count_map.get("session_completed", 0),
        courses_enrolled=count_map.get("course_enrolled", 0),
        groups_participated=count_map.get("group_participated", 0),
        crisis_flags=count_map.get("crisis_flagged", 0),
        month_only=month_only,
    )


# ─── Todos (HR 三档待办) ─────────────────────────────────────────


@router.get("/todos", response_model=TodosResponse)
async def get_todos(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TodosResponse:
    """HR 三档待办. 镜像 eap-analytics.routes.ts:90-133.

    1. open_crisis_count: status='open' 的危机告警数
    2. pending_employee_bind_count: 有 events 但档案不全 (无 employee_id 或 department) 的 user 数
    3. subscription_ends_in_days: license 到期还剩天数 (None = 已过期 / 无 license)
    """
    org_ctx = _require_enterprise_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    # 1. open crisis count
    cq = (
        select(func.count())
        .select_from(EAPCrisisAlert)
        .where(
            and_(
                EAPCrisisAlert.enterprise_org_id == org_uuid,
                EAPCrisisAlert.status == "open",
            )
        )
    )
    open_crisis = (await db.execute(cq)).scalar_one() or 0

    # 2. pending employee bind: 有 events 但档案不全
    # raw SQL 与 Node 一致 (LEFT JOIN + filter ON (eep.id IS NULL OR employee_id NULL OR dept NULL))
    pending_q = text(
        """
        SELECT count(DISTINCT eue.user_id)::int AS cnt
        FROM eap_usage_events eue
        LEFT JOIN eap_employee_profiles eep
          ON eep.user_id = eue.user_id AND eep.org_id = eue.enterprise_org_id
        WHERE eue.enterprise_org_id = :org_id
          AND eue.user_id IS NOT NULL
          AND (
            eep.id IS NULL
            OR eep.employee_id IS NULL
            OR eep.department IS NULL
          )
        """
    )
    pending_row = (await db.execute(pending_q, {"org_id": org_uuid})).first()
    pending_bind = int(pending_row[0] if pending_row else 0)

    # 3. subscription_ends_in_days: 从 OrgContext.license 读
    expires_at_str = org_ctx.license.expires_at
    subscription_ends_in_days: int | None = None
    subscription_ends_at: str | None = None
    if expires_at_str:
        subscription_ends_at = expires_at_str
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            now = datetime.now(UTC)
            subscription_ends_in_days = int((expires_at - now).total_seconds() // (24 * 3600))
        except (ValueError, TypeError):
            subscription_ends_in_days = None

    return TodosResponse(
        open_crisis_count=int(open_crisis),
        pending_employee_bind_count=pending_bind,
        subscription_ends_in_days=subscription_ends_in_days,
        subscription_ends_at=subscription_ends_at,
    )


# ─── Usage Trend (time series) ───────────────────────────────────


@router.get("/usage-trend", response_model=UsageTrendResponse)
async def get_usage_trend(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: Annotated[str | None, Query()] = None,
) -> UsageTrendResponse:
    """时间序列 (按天 + 按事件类型). 镜像 eap-analytics.routes.ts:136-166."""
    org_ctx = _require_enterprise_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    # parse days, 默认 30
    try:
        days_n = int(days) if days else 30
    except (ValueError, TypeError):
        days_n = 30

    since = (datetime.now(UTC) - timedelta(days=days_n)).date()

    q = (
        select(
            EAPUsageEvent.event_date,
            EAPUsageEvent.event_type,
            func.count(),
        )
        .where(
            and_(
                EAPUsageEvent.enterprise_org_id == org_uuid,
                EAPUsageEvent.event_date >= since,
            )
        )
        .group_by(EAPUsageEvent.event_date, EAPUsageEvent.event_type)
        .order_by(EAPUsageEvent.event_date)
    )
    rows = (await db.execute(q)).all()

    return UsageTrendResponse(
        period=UsageTrendPeriod(days=days_n, since=since.isoformat()),
        data=[UsageTrendItem(date=row[0], type=row[1], count=int(row[2])) for row in rows],
    )


# ─── Risk Distribution ───────────────────────────────────────────


@router.get("/risk-distribution", response_model=RiskDistributionResponse)
async def get_risk_distribution(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RiskDistributionResponse:
    """风险等级分布 (仅 assessment_completed 事件). 镜像 eap-analytics.routes.ts:169-191."""
    org_ctx = _require_enterprise_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    q = (
        select(EAPUsageEvent.risk_level, func.count())
        .where(
            and_(
                EAPUsageEvent.enterprise_org_id == org_uuid,
                EAPUsageEvent.event_type == "assessment_completed",
            )
        )
        .group_by(EAPUsageEvent.risk_level)
    )
    rows = (await db.execute(q)).all()

    return RiskDistributionResponse(
        distribution=[RiskDistEntry(level=row[0] or "unknown", count=int(row[1])) for row in rows]
    )


# ─── Department Breakdown (k-anonymity) ──────────────────────────


@router.get("/department", response_model=DepartmentResponse)
async def get_department_breakdown(
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DepartmentResponse:
    """部门分布 (按 risk_level), k-anonymity k>=5. 镜像 eap-analytics.routes.ts:194-270.

    部门员工数 < K → merge into '其他' 行 (防 re-identification).
    """
    org_ctx = _require_enterprise_admin(org)
    org_uuid = parse_uuid_or_raise(org_ctx.org_id, field="orgId")

    # 部门 × risk_level 计数 (assessment_completed)
    sq = (
        select(
            EAPUsageEvent.department,
            EAPUsageEvent.risk_level,
            func.count(),
        )
        .where(
            and_(
                EAPUsageEvent.enterprise_org_id == org_uuid,
                EAPUsageEvent.event_type == "assessment_completed",
            )
        )
        .group_by(EAPUsageEvent.department, EAPUsageEvent.risk_level)
    )
    dept_stat_rows = (await db.execute(sq)).all()

    # 部门员工数
    eq = (
        select(EAPEmployeeProfile.department, func.count())
        .where(EAPEmployeeProfile.org_id == org_uuid)
        .group_by(EAPEmployeeProfile.department)
    )
    dept_count_rows = (await db.execute(eq)).all()
    dept_count_map: dict[str, int] = {(row[0] or "未分配"): int(row[1]) for row in dept_count_rows}

    # 聚合到 dict
    dept_map: dict[str, dict[str, int]] = {}
    for dept_raw, level_raw, cnt in dept_stat_rows:
        dept = dept_raw or "未分配"
        level = level_raw or "unknown"
        dept_map.setdefault(dept, {})[level] = int(cnt)

    # 应用 k-anonymity: 员工数 < K → 合并到 "其他"
    departments: list[DepartmentEntry] = []
    other_risk: dict[str, int] = {}
    other_employee_count = 0

    for dept, risk_dict in dept_map.items():
        emp_count = dept_count_map.get(dept, 0)
        if emp_count < K_ANONYMITY:
            for level, cnt in risk_dict.items():
                other_risk[level] = other_risk.get(level, 0) + cnt
            other_employee_count += emp_count
        else:
            departments.append(
                DepartmentEntry(
                    name=dept,
                    employee_count=emp_count,
                    risk_distribution=risk_dict,
                )
            )

    if other_employee_count > 0:
        departments.append(
            DepartmentEntry(
                name="其他",
                employee_count=other_employee_count,
                risk_distribution=other_risk,
            )
        )

    return DepartmentResponse(departments=departments)


__all__ = ["K_ANONYMITY", "router"]
