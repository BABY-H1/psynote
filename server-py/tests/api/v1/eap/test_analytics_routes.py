"""
EAP Analytics routes tests — 镜像 ``server/src/modules/eap/eap-analytics.routes.ts`` 5 endpoints.

⚠ 关键守门 (合规红线):
  - non-enterprise org → 403 (HR 不能在 counseling org 看 EAP 聚合)
  - non-admin → 403

覆盖:
  - GET /overview (happy + month_only + non-enterprise 403)
  - GET /todos (happy)
  - GET /usage-trend (happy + custom days)
  - GET /risk-distribution (happy)
  - GET /department (happy + k-anonymity merge into '其他')
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.eap.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


# ─── GET /overview ──────────────────────────────────────────────


def test_overview_happy(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """KPI tiles 累计."""
    # 1) total_employees count; 2) event counts by type
    setup_db_results(
        [
            100,
            [
                ("assessment_completed", 50),
                ("session_booked", 20),
                ("crisis_flagged", 1),
            ],
        ]
    )
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["totalEmployees"] == 100
    assert body["assessmentsCompleted"] == 50
    assert body["sessionsBooked"] == 20
    assert body["crisisFlags"] == 1
    assert body["monthOnly"] is False


def test_overview_month_only(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """``?month=current`` → 仅本月计数, monthOnly=True."""
    setup_db_results([100, [("assessment_completed", 5)]])
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/overview?month=current")
    assert r.status_code == 200
    assert r.json()["monthOnly"] is True


def test_overview_non_enterprise_org_403(
    non_enterprise_admin_client: TestClient,
) -> None:
    """⭐ HR 在 counseling org → 403 (合规红线: aggregate-only 限于 enterprise)."""
    r = non_enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/overview")
    assert r.status_code == 403


def test_overview_counselor_role_403(
    counselor_org_client: TestClient,
) -> None:
    """非 org_admin → 403 (即使是 enterprise org)."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/overview")
    assert r.status_code == 403


# ─── GET /todos ─────────────────────────────────────────────────


def test_todos_happy(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """三档待办 — open crisis + pending bind + subscription days."""
    # 1) open_crisis count; 2) pending_bind raw row
    setup_db_results([3, (7,)])
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/todos")
    assert r.status_code == 200
    body = r.json()
    assert body["openCrisisCount"] == 3
    assert body["pendingEmployeeBindCount"] == 7
    # license 是 None → subscriptionEndsInDays 也 None
    assert body["subscriptionEndsInDays"] is None


# ─── GET /usage-trend ───────────────────────────────────────────


def test_usage_trend_default_30_days(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """无 ?days → 默认 30 天."""
    from datetime import date

    setup_db_results(
        [
            [(date(2026, 5, 1), "assessment_completed", 10)],
        ]
    )
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/usage-trend")
    assert r.status_code == 200
    body = r.json()
    assert body["period"]["days"] == 30
    assert len(body["data"]) == 1


def test_usage_trend_custom_days(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/usage-trend?days=7")
    assert r.status_code == 200
    assert r.json()["period"]["days"] == 7


# ─── GET /risk-distribution ─────────────────────────────────────


def test_risk_distribution_happy(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[("level_1", 30), ("level_2", 15), (None, 5)]])
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/risk-distribution")
    assert r.status_code == 200
    body = r.json()
    levels = {d["level"]: d["count"] for d in body["distribution"]}
    assert levels["level_1"] == 30
    assert levels["level_2"] == 15
    assert levels["unknown"] == 5  # None 会 fallback 为 'unknown'


# ─── GET /department (k-anonymity) ──────────────────────────────


def test_department_breakdown_k_anonymity_merges_small_depts(
    enterprise_admin_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """⭐ 关键: 部门员工数 < 5 → 合并到 '其他' (防 re-identification).

    本测试 2 个部门:
      - "技术部": 10 人 (>= K), 保留
      - "财务部": 3 人 (< K), 被合并到 '其他'
    """
    # 1) 部门 × risk_level 计数; 2) 部门员工数
    setup_db_results(
        [
            [
                ("技术部", "level_1", 5),
                ("技术部", "level_2", 2),
                ("财务部", "level_1", 1),
            ],
            [
                ("技术部", 10),
                ("财务部", 3),
            ],
        ]
    )
    r = enterprise_admin_client.get(f"/api/orgs/{_ORG_ID}/eap/analytics/department")
    assert r.status_code == 200
    body = r.json()
    names = {d["name"] for d in body["departments"]}
    assert "技术部" in names
    assert "财务部" not in names  # 被合并
    assert "其他" in names  # 财务部归入此

    # 验 '其他' 含 (财务部) 1 人 + 1 个 level_1 测评
    other_entry = next(d for d in body["departments"] if d["name"] == "其他")
    assert other_entry["employeeCount"] == 3
    assert other_entry["riskDistribution"]["level_1"] == 1
