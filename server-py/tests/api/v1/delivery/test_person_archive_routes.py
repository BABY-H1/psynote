"""
Person archive 路由测试 — 镜像 ``server/src/modules/delivery/person-archive.routes.ts``。

Endpoints:
  GET   /api/orgs/{org_id}/people                      — 列表
  GET   /api/orgs/{org_id}/people/{user_id}/archive    — 单人完整档案
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.delivery.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000010"


# ─── GET /people ────────────────────────────────────────────────


def test_list_people_happy_returns_summary(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    now = datetime(2026, 5, 1, tzinfo=UTC)
    row = {
        "user_id": _USER_ID,
        "name": "Alice",
        "email": "alice@x.com",
        "last_activity_at": now,
        "counseling": 2,
        "group_count": 1,
        "course_count": 0,
        "assessment": 3,
    }
    setup_db_results([[row]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/people/")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 1
    summary = body["items"][0]
    assert summary["name"] == "Alice"
    assert summary["counts"]["counseling"] == 2
    assert summary["counts"]["assessment"] == 3
    assert summary["counts"]["total"] == 6


def test_list_people_rejects_client_role(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/people/")
    assert r.status_code == 403


# ─── GET /people/{user_id}/archive ──────────────────────────────


def test_get_person_archive_user_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """asyncio.gather 5 query — user 行 None 触发 404."""
    setup_db_results([None, [], [], [], []])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/people/{_USER_ID}/archive")
    assert r.status_code == 404


def test_get_person_archive_happy_returns_unified_archive(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user_row: Any,
    make_episode: Any,
    make_group_instance: Any,
    make_group_enrollment: Any,
    make_course_instance: Any,
    make_course_enrollment: Any,
    make_assessment: Any,
    make_assessment_result: Any,
) -> None:
    """5 query 顺序: user, episodes, groups, courses, assessments.

    每条都返一行 — 验证 services 列表 + timeline + stats 总和。
    """
    user = make_user_row()
    e = make_episode()
    gi = make_group_instance()
    ge = make_group_enrollment()
    ci = make_course_instance()
    cen = make_course_enrollment()
    a = make_assessment()
    ar = make_assessment_result()

    # group_q / course_q / assessment_q 用 select(Model1, Model2) — `.all()` 返 tuple list
    setup_db_results(
        [
            user,  # user_q.scalar_one_or_none
            [e],  # episode_q.scalars().all
            [(ge, gi)],  # group_q.all
            [(cen, ci)],  # course_q.all
            [(ar, a)],  # assessment_q.all
        ]
    )
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/people/{_USER_ID}/archive")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["id"] == _USER_ID
    assert body["stats"]["total"] == 4  # 1 episode + 1 group + 1 course + 1 assessment
    # 4 条 service 行各自 kind 应都出现 (dedupe 后唯一)
    kinds = {s["kind"] for s in body["services"]}
    assert kinds == {"counseling", "group", "course", "assessment"}
    # timeline 应至少包含 episode_opened, group_enrolled, course_enrolled, assessment_taken
    types = {ev["type"] for ev in body["timeline"]}
    assert "episode_opened" in types
    assert "group_enrolled" in types
    assert "course_enrolled" in types
    assert "assessment_taken" in types


def test_get_person_archive_rejects_client_role(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/people/{_USER_ID}/archive")
    assert r.status_code == 403


# 防 ruff 提示 uuid 未使用
_ = uuid
