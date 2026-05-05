"""
School analytics routes tests — 镜像 ``school-analytics.routes.ts`` 4 endpoints.

⚠ 关键守门 (合规约束):
  - 非 school org → 403

覆盖:
  - GET /overview (happy + risk dist + non-school 403)
  - GET /risk-by-class (happy + sort by high-risk count desc)
  - GET /high-risk-students (happy + level_4 优先排序)
  - GET /crisis-by-class (happy)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.school.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


# ─── GET /overview ──────────────────────────────────────────────


def test_overview_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """KPI: 本月测评 / 风险分布 / open + pending crisis."""
    # 1) overview row (assessments_this_month, open_crisis, pending_signoff)
    # 2) risk dist rows
    setup_db_results(
        [
            (15, 2, 1),
            [("level_1", 10), ("level_3", 3), ("level_4", 1)],
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["assessmentsThisMonth"] == 15
    assert body["openCrisisCount"] == 2
    assert body["pendingSignOffCount"] == 1
    assert body["riskLevelDistribution"]["level_1"] == 10
    assert body["riskLevelDistribution"]["level_3"] == 3
    assert body["riskLevelDistribution"]["level_4"] == 1
    assert body["riskLevelDistribution"]["level_2"] == 0  # 默认 0


def test_overview_non_school_org_403(
    non_school_admin_client: TestClient,
) -> None:
    """⭐ 非 school org → 403 (合规)."""
    r = non_school_admin_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/overview")
    assert r.status_code == 403


# ─── GET /risk-by-class ─────────────────────────────────────────


def test_risk_by_class_happy_sorted_by_high_risk(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """⭐ 排序: 高风险 (l3+l4) 多的在前. 含 grade/className 同级 fallback."""
    setup_db_results(
        [
            [
                # 高一 1 班: 5 level_1 + 0 level_4 — high_risk = 0
                ("高一", "1 班", "level_1", 5),
                # 高一 2 班: 1 level_1 + 2 level_4 — high_risk = 2 (排在前)
                ("高一", "2 班", "level_1", 1),
                ("高一", "2 班", "level_4", 2),
            ]
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/risk-by-class")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["className"] == "2 班"  # 高风险多的排前
    assert body[0]["riskCounts"]["level_4"] == 2
    assert body[1]["className"] == "1 班"


# ─── GET /high-risk-students ────────────────────────────────────


def test_high_risk_students_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """level_4 优先 (CASE 排序), 含 has_open_crisis."""
    import uuid

    setup_db_results(
        [
            [
                (
                    uuid.UUID("00000000-0000-0000-0000-000000000010"),
                    "学生甲",
                    "S001",
                    "高一",
                    "1 班",
                    "level_4",
                    "2026-05-01T00:00:00Z",
                    True,
                ),
            ]
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/high-risk-students")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["riskLevel"] == "level_4"
    assert body[0]["hasOpenCrisis"] is True
    assert body[0]["name"] == "学生甲"


def test_high_risk_students_custom_limit(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """``?limit=5`` parsed."""
    setup_db_results([[]])
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/high-risk-students?limit=5")
    assert r.status_code == 200
    assert r.json() == []


# ─── GET /crisis-by-class ───────────────────────────────────────


def test_crisis_by_class_happy(
    admin_school_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results(
        [
            [
                ("高一", "1 班", 2, 1, 5, 8),
                ("高二", "3 班", 0, 0, 3, 3),
            ]
        ]
    )
    r = admin_school_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/crisis-by-class")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert body[0]["openCount"] == 2
    assert body[0]["pendingSignOffCount"] == 1
    assert body[0]["closedCount"] == 5
    assert body[0]["total"] == 8


def test_crisis_by_class_non_school_org_403(
    non_school_admin_client: TestClient,
) -> None:
    """⭐ 非 school org → 403."""
    r = non_school_admin_client.get(f"/api/orgs/{_ORG_ID}/school/analytics/crisis-by-class")
    assert r.status_code == 403
