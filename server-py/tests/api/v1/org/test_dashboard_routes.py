"""
Dashboard routes — 镜像 ``dashboard.routes.ts``.

Phase 3 smoke tests:
  - GET /api/orgs/{id}/dashboard/stats     — 7 KPI 快照 (admin only)
  - GET /api/orgs/{id}/dashboard/kpi-delta — 5 KPI delta (admin only, ?window=month|week)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


def test_stats_admin_only(counselor_org_client: TestClient) -> None:
    """non-admin → 403."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/stats")
    assert r.status_code == 403


def test_stats_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/stats")
    assert r.status_code == 403


def test_stats_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """优化后单 SQL 多 scalar subquery — 1 个 .first() 返回 7-tuple.

    顺序: counselor, client, session, unassigned, group, course, assessment.
    """
    # 单 row, .first() 返 tuple-like (mock fixture 把 list 直接当 row 返)
    setup_db_results([(5, 10, 20, 2, 3, 4, 7)])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["counselorCount"] == 5
    assert body["clientCount"] == 10
    assert body["monthlySessionCount"] == 20
    assert body["unassignedCount"] == 2
    assert body["activeGroupCount"] == 3
    assert body["activeCourseCount"] == 4
    assert body["monthlyAssessmentCount"] == 7


def test_kpi_delta_default_month(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """5 KPI × 2 windows = 10 个 count. 优化后单 SQL → 1 row 10-tuple.

    顺序: newClient.cur, newClient.prev, session.cur, session.prev,
          groupActive.cur, groupActive.prev, courseActive.cur, courseActive.prev,
          assessment.cur, assessment.prev (与 router._KPI_KINDS 顺序一致).
    """
    setup_db_results([(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/kpi-delta")
    assert r.status_code == 200
    body = r.json()
    assert body["newClient"]["current"] == 1
    assert body["newClient"]["previous"] == 2
    assert body["assessment"]["current"] == 9
    assert body["assessment"]["previous"] == 10


def test_kpi_delta_week_window(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([(0,) * 10])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/kpi-delta?window=week")
    assert r.status_code == 200
    body = r.json()
    assert body["newClient"]["current"] == 0
