"""
Treatment plan router tests — 镜像 ``server/src/modules/counseling/treatment-plan.routes.ts``。

Endpoints (5):
  GET    /                                    — list (按 careEpisodeId, required)
  GET    /{plan_id}                           — detail
  POST   /                                    — create + timeline
  PATCH  /{plan_id}                           — update
  PATCH  /{plan_id}/goals/{goal_id}           — goal status update (in-place JSONB)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_PLAN_ID = "00000000-0000-0000-0000-000000000666"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_plans_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    p = make_treatment_plan()  # type: ignore[operator]
    setup_db_results([[p]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/treatment-plans/?careEpisodeId={_EPISODE_ID}")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_plans_missing_episode_id_400(admin_org_client: TestClient) -> None:
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/treatment-plans/")
    assert r.status_code == 400


# ─── GET /{plan_id} 详情 ────────────────────────────────────────


def test_get_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    p = make_treatment_plan(title="Plan X")  # type: ignore[operator]
    setup_db_results([p])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}")
    assert r.status_code == 200
    assert r.json()["title"] == "Plan X"


def test_get_plan_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/treatment-plans/",
        json={"careEpisodeId": _EPISODE_ID, "title": "新计划"},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_plan_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/treatment-plans/",
        json={"careEpisodeId": _EPISODE_ID},
    )
    assert r.status_code == 403


# ─── PATCH /{plan_id} ──────────────────────────────────────────


def test_update_plan_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    p = make_treatment_plan(title="旧")  # type: ignore[operator]
    setup_db_results([p])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}",
        json={"title": "新"},
    )
    assert r.status_code == 200
    assert p.title == "新"


def test_update_plan_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


# ─── PATCH /{plan_id}/goals/{goal_id} ──────────────────────────


def test_update_goal_status_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    p = make_treatment_plan(  # type: ignore[operator]
        goals=[{"id": "g1", "description": "降低焦虑", "status": "in_progress"}]
    )
    setup_db_results([p])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}/goals/g1",
        json={"status": "completed"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["goals"][0]["status"] == "completed"


def test_update_goal_status_404_when_goal_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_treatment_plan: object,
) -> None:
    p = make_treatment_plan(goals=[])  # type: ignore[operator]
    setup_db_results([p])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}/goals/missing-goal",
        json={"status": "completed"},
    )
    assert r.status_code == 404


def test_update_goal_status_404_when_plan_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/treatment-plans/{_PLAN_ID}/goals/g1",
        json={"status": "completed"},
    )
    assert r.status_code == 404
