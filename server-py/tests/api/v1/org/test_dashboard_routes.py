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
    """7 个独立 count 查询, 每个 .scalar() 返回数字."""
    setup_db_results(
        [
            5,  # counselor_count
            10,  # client_count
            20,  # session_count
            2,  # unassigned
            3,  # group
            4,  # course
            7,  # assessment
        ]
    )
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
    """5 KPI × 2 windows = 10 个 count, FIFO 顺序: newClient.cur, newClient.prev,
    session.cur, session.prev, group.cur, group.prev, course.cur, course.prev,
    assessment.cur, assessment.prev (与 router._kpi_pair 调用顺序一致)."""
    setup_db_results([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
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
    setup_db_results([0] * 10)
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/dashboard/kpi-delta?window=week")
    assert r.status_code == 200
    body = r.json()
    assert body["newClient"]["current"] == 0
