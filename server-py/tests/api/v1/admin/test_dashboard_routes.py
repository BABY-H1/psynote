"""
Admin dashboard routes — 镜像 ``admin-dashboard.routes.ts``.

Phase 3 Tier 4 smoke tests:
  - GET /api/admin/dashboard  — 经营看板 (sysadm only, 多 SQL 拼装)

测试聚焦在 sysadm 守门 + 多查询拼装的 happy path 形状, 不深入 SQL 细节
(Postgres-specific text() 在 mock 层不验证 SQL 正确性, 只验路由层逻辑).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.admin.conftest import SetupDbResults


def test_dashboard_requires_auth(client: TestClient) -> None:
    r = client.get("/api/admin/dashboard/")
    assert r.status_code == 401


def test_dashboard_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/dashboard/")
    assert r.status_code == 403


def test_dashboard_empty_db(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """干净 DB → tiles 全 0, trends 空, alerts 空.

    7 个 query 顺序 (与 router 实装一致):
      1. active_orgs_q.all() — distinct org_id
      2. mau_q.scalar()       — last_login_at >= 30d 用户数
      3. mce_q.scalar()       — care_episodes 月新增
      4. all_orgs_q.all()     — 全 orgs (license verify)
      5. tenant_growth_sql.all()
      6. user_activity_sql.all()
      7. recent_lic_sql.all()
      8. operational_orgs_sql.all()
    """
    setup_db_results([[], 0, 0, [], [], [], [], []])
    r = sysadm_client.get("/api/admin/dashboard/")
    assert r.status_code == 200
    body = r.json()
    assert body["tiles"]["activeTenants"] == 0
    assert body["tiles"]["monthlyActiveUsers"] == 0
    assert body["tiles"]["monthlyCareEpisodes"] == 0
    assert body["tiles"]["expiringLicenses"] == 0
    assert body["trends"]["tenantGrowth"] == []
    assert body["alerts"]["operationalOrgs"] == []


def test_dashboard_with_active_tenants(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """active_orgs row 非空 → activeTenants tile 正确计数."""
    # 模拟 3 行 distinct org_id
    active_rows = [type("R", (), {"org_id": f"org-{i}"})() for i in range(3)]
    setup_db_results([active_rows, 50, 20, [], [], [], [], []])
    r = sysadm_client.get("/api/admin/dashboard/")
    assert r.status_code == 200
    body = r.json()
    assert body["tiles"]["activeTenants"] == 3
    assert body["tiles"]["monthlyActiveUsers"] == 50
    assert body["tiles"]["monthlyCareEpisodes"] == 20
