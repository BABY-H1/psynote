"""
Admin dashboard router — 镜像 ``server/src/modules/admin/admin-dashboard.routes.ts`` (251 行).

挂在 ``/api/admin/dashboard`` prefix. 1 个 endpoint:

  GET /  — 全平台经营看板 (sysadm only)

返回结构 (与 Node admin-dashboard.routes.ts:221-249 完全一致):

  {
    tiles: { activeTenants, monthlyActiveUsers, monthlyCareEpisodes, expiringLicenses },
    trends: { tenantGrowth: [...], userActivity: [...] },
    alerts: { expiredLicenseOrgs: [...], recentLicenseActivity: [...], operationalOrgs: [...] },
  }

Phase 3 阶段实装注:
  ``verifyLicense`` (server/src/lib/license/verify.ts) 是 RSA + JWT 签名校验,
  Phase 5 接真实实装. 当前 stub: 任意非空 ``license_key`` → status='active' (与
  ``app/middleware/org_context.py`` Phase 1.6 注释保持一致). 这让 dashboard 的
  ``expiringLicenses`` tile + ``operationalOrgs.licenseStatus`` 字段返回合理占位
  (Phase 5 接入后行为自动收敛到真实校验).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.schemas import (
    DashboardAlerts,
    DashboardResponse,
    DashboardTiles,
    DashboardTrends,
    ExpiringLicenseAlert,
    OperationalOrg,
    RecentLicenseActivity,
    TenantGrowthPoint,
    UserActivityPoint,
)
from app.core.database import get_db
from app.db.models.care_episodes import CareEpisode
from app.db.models.org_members import OrgMember
from app.db.models.organizations import Organization
from app.db.models.users import User
from app.lib.errors import ForbiddenError
from app.middleware.auth import AuthUser, get_current_user

router = APIRouter()


def _require_system_admin(user: AuthUser) -> None:
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")


def _verify_license_stub(license_key: str | None) -> dict[str, Any]:
    """Phase 3 stub — 镜像 ``verifyLicense`` 返回结构.

    Phase 5 ticket: 接 RSA + JWT 校验. 当前任何非空 key → ``status='active'``
    + 默认 90 天有效期 (从 now 起算), 让 dashboard tiles 跑出合理形状.
    """
    if not license_key:
        return {"status": "none", "tier": None, "expires_at": None}
    # Phase 3: 不解析, 只持久化, 视作 active. 默认 expires_at None (前端按 'active +
    # 无 expiresAt' 不显示倒计时).
    return {"status": "active", "tier": None, "expires_at": None}


@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
    user: Annotated[AuthUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardResponse:
    """全平台经营看板 (sysadm only). 镜像 admin-dashboard.routes.ts:30-250.

    多个独立查询 (Postgres CTE / 直接 SQL), 分批跑.
    """
    _require_system_admin(user)

    now = datetime.now(UTC)
    start_of_month = datetime(now.year, now.month, 1, tzinfo=UTC)
    thirty_days_ago = now - timedelta(days=30)
    thirty_days_from_now = now + timedelta(days=30)

    # ── Tiles ─────────────────────────────────────────────────────

    # Active tenants: distinct org_id where status='active' member 存在
    active_orgs_q = (
        select(OrgMember.org_id).where(OrgMember.status == "active").group_by(OrgMember.org_id)
    )
    active_orgs_rows = (await db.execute(active_orgs_q)).all()
    active_tenants = len(active_orgs_rows)

    # Monthly active users (last_login_at >= 30d ago)
    mau_q = select(func.count()).where(
        and_(
            User.last_login_at.is_not(None),
            User.last_login_at >= thirty_days_ago,
        )
    )
    monthly_active_users = int((await db.execute(mau_q)).scalar() or 0)

    # Monthly new care episodes
    mce_q = select(func.count()).where(CareEpisode.created_at >= start_of_month)
    monthly_care_episodes = int((await db.execute(mce_q)).scalar() or 0)

    # All orgs for license verification
    all_orgs_q = select(
        Organization.id,
        Organization.name,
        Organization.slug,
        Organization.license_key,
        Organization.plan,
        Organization.created_at,
    )
    all_orgs_rows = (await db.execute(all_orgs_q)).all()

    # Verify licenses (stub) — 一次, 后面 expiringLicenses + operationalOrgs 共用.
    license_by_org_id: dict[Any, dict[str, Any]] = {}
    license_checks: list[dict[str, Any]] = []
    for org in all_orgs_rows:
        check = _verify_license_stub(org.license_key)
        check["org_id"] = str(org.id)
        check["org_name"] = org.name
        license_by_org_id[org.id] = check
        license_checks.append(check)

    # Expiring = expired OR expires within 30 days
    def _is_expiring(check: dict[str, Any]) -> bool:
        if check["status"] == "expired":
            return True
        if check["status"] == "active" and check.get("expires_at"):
            try:
                exp = datetime.fromisoformat(str(check["expires_at"]).replace("Z", "+00:00"))
                return exp <= thirty_days_from_now
            except (ValueError, TypeError):
                return False
        return False

    expiring_orgs = [c for c in license_checks if _is_expiring(c)]

    tiles = DashboardTiles(
        active_tenants=active_tenants,
        monthly_active_users=monthly_active_users,
        monthly_care_episodes=monthly_care_episodes,
        expiring_licenses=len(expiring_orgs),
    )

    # ── Trends ────────────────────────────────────────────────────

    # tenant_growth: 最近 12 月新建 org 数
    tenant_growth_sql = text(
        """
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') AS month,
          COUNT(*) AS count
        FROM organizations
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month
        """
    )
    tg_rows = (await db.execute(tenant_growth_sql)).all()
    tenant_growth = [
        TenantGrowthPoint(
            month=str(r._mapping["month"]),
            count=int(r._mapping["count"] or 0),
        )
        for r in tg_rows
    ]

    # user_activity: 最近 6 月每月活跃用户数
    user_activity_sql = text(
        """
        SELECT
          TO_CHAR(last_login_at, 'YYYY-MM') AS month,
          COUNT(DISTINCT id) AS active_users
        FROM users
        WHERE last_login_at >= NOW() - INTERVAL '6 months'
          AND last_login_at IS NOT NULL
        GROUP BY TO_CHAR(last_login_at, 'YYYY-MM')
        ORDER BY month
        """
    )
    ua_rows = (await db.execute(user_activity_sql)).all()
    user_activity = [
        UserActivityPoint(month=str(r.month), active_users=int(r.active_users or 0))
        for r in ua_rows
    ]

    trends = DashboardTrends(tenant_growth=tenant_growth, user_activity=user_activity)

    # ── Alerts ────────────────────────────────────────────────────

    # Recent license activity (10 rows). 与 Node 一样 COALESCE(org_id, resource_id)
    # 走 — admin-license 端没 orgContextGuard, audit_logs.org_id 是 NULL,
    # tenant 在 resource_id (resource='organization').
    recent_lic_sql = text(
        """
        SELECT
          al.action,
          COALESCE(al.org_id, al.resource_id) AS org_id,
          o.name AS org_name,
          al.created_at
        FROM audit_logs al
        LEFT JOIN organizations o
          ON o.id = COALESCE(al.org_id, al.resource_id)
        WHERE al.action LIKE 'license.%'
        ORDER BY al.created_at DESC
        LIMIT 10
        """
    )
    rl_rows = (await db.execute(recent_lic_sql)).all()
    recent_license_activity = [
        RecentLicenseActivity(
            action=str(r.action),
            org_id=str(r.org_id) if r.org_id is not None else None,
            org_name=str(r.org_name) if r.org_name is not None else "已删除的机构",
            created_at=(
                r.created_at.isoformat()
                if isinstance(r.created_at, datetime)
                else str(r.created_at or "")
            ),
        )
        for r in rl_rows
    ]

    # Operational orgs: 多 CTE 合一 (active member + monthly eps + last activity)
    op_sql = text(
        """
        WITH active_members AS (
          SELECT org_id, COUNT(*) AS active_member_count
          FROM org_members
          WHERE status = 'active'
          GROUP BY org_id
        ),
        monthly_eps AS (
          SELECT org_id, COUNT(*) AS monthly_episode_count
          FROM care_episodes
          WHERE created_at >= :start_of_month
          GROUP BY org_id
        ),
        last_activity AS (
          SELECT org_id, MAX(created_at) AS last_activity_at
          FROM audit_logs
          WHERE org_id IS NOT NULL
          GROUP BY org_id
        )
        SELECT
          o.id, o.name, o.slug,
          COALESCE(am.active_member_count, 0)::int AS active_member_count,
          COALESCE(me.monthly_episode_count, 0)::int AS monthly_episode_count,
          la.last_activity_at
        FROM organizations o
        LEFT JOIN active_members am ON am.org_id = o.id
        LEFT JOIN monthly_eps     me ON me.org_id = o.id
        LEFT JOIN last_activity   la ON la.org_id = o.id
        ORDER BY la.last_activity_at DESC NULLS LAST, o.created_at DESC
        LIMIT 20
        """
    ).bindparams(start_of_month=start_of_month)
    op_rows = (await db.execute(op_sql)).all()

    operational_orgs: list[OperationalOrg] = []
    for r in op_rows:
        lic = license_by_org_id.get(r.id) or {}
        last_at = r.last_activity_at
        operational_orgs.append(
            OperationalOrg(
                org_id=str(r.id),
                org_name=r.name,
                slug=r.slug,
                active_member_count=int(r.active_member_count or 0),
                monthly_episodes=int(r.monthly_episode_count or 0),
                tier=lic.get("tier"),
                license_status=str(lic.get("status") or "none"),
                license_expires_at=lic.get("expires_at"),
                last_activity_at=(last_at.isoformat() if isinstance(last_at, datetime) else None),
            )
        )

    alerts = DashboardAlerts(
        expired_license_orgs=[
            ExpiringLicenseAlert(
                org_id=str(c["org_id"]),
                org_name=str(c["org_name"]),
                expires_at=c.get("expires_at"),
            )
            for c in expiring_orgs[:10]
        ],
        recent_license_activity=recent_license_activity,
        operational_orgs=operational_orgs,
    )

    return DashboardResponse(tiles=tiles, trends=trends, alerts=alerts)


__all__ = ["router"]
