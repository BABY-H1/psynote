"""
Goal library router tests — 镜像 ``server/src/modules/counseling/goal-library.routes.ts``。

Endpoints (5):
  GET    /              — list (filters: problemArea / category / visibility)
  GET    /{goal_id}     — detail
  POST   /              — create
  PATCH  /{goal_id}     — update (ownership check)
  DELETE /{goal_id}     — delete (ownership check)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_GOAL_ID = "00000000-0000-0000-0000-000000000aaa"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_goals_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_goal_library: object,
) -> None:
    g = make_goal_library()  # type: ignore[operator]
    setup_db_results([[g]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/goal-library/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_goals_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/goal-library/")
    assert r.status_code == 403


# ─── GET /{goal_id} ────────────────────────────────────────────


def test_get_goal_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_goal_library: object,
) -> None:
    g = make_goal_library(title="Goal X")  # type: ignore[operator]
    setup_db_results([g])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}")
    assert r.status_code == 200
    assert r.json()["title"] == "Goal X"


def test_get_goal_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_goal_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/goal-library/",
        json={"title": "降低焦虑", "problemArea": "anxiety"},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_goal_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/goal-library/",
        json={"title": "x", "problemArea": "anxiety"},
    )
    assert r.status_code == 403


# ─── PATCH /{goal_id} ──────────────────────────────────────────


def test_update_goal_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_goal_library: object,
) -> None:
    g = make_goal_library(title="旧")  # type: ignore[operator]
    # ownership check + 主查
    setup_db_results([(g.org_id,), g])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}",
        json={"title": "新"},
    )
    assert r.status_code == 200
    assert g.title == "新"


def test_update_goal_403_other_org(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """目标属于别的 org → 403."""
    other_org = uuid.UUID("00000000-0000-0000-0000-000000000abc")
    setup_db_results([(other_org,)])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 403


# ─── DELETE /{goal_id} ─────────────────────────────────────────


def test_delete_goal_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_goal_library: object,
    mock_db: AsyncMock,
) -> None:
    g = make_goal_library()  # type: ignore[operator]
    setup_db_results([(g.org_id,), g, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}")
    assert r.status_code == 200
    assert r.json()["success"] is True
    mock_db.commit.assert_awaited()


def test_delete_goal_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/goal-library/{_GOAL_ID}")
    assert r.status_code == 404
