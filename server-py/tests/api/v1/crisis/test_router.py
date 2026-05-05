"""
Crisis router tests — 镜像 ``server/src/modules/crisis/crisis-case.routes.ts``.

Endpoints (7):
  GET  /stats
  GET  /cases (filter ?stage=)
  GET  /cases/{caseId}
  GET  /cases/by-episode/{episodeId}
  PUT  /cases/{caseId}/checklist/{stepKey}
  POST /cases/{caseId}/submit
  POST /cases/{caseId}/sign-off

各端点 happy + sad case。
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.crisis.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CASE_ID = "00000000-0000-0000-0000-000000000c01"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET /cases 列表 ─────────────────────────────────────────────


def test_list_cases_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
) -> None:
    case = make_crisis_case()  # type: ignore[operator]
    setup_db_results([[case]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["id"] == _CASE_ID
    assert body[0]["stage"] == "open"


def test_list_cases_filter_by_stage(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
) -> None:
    case = make_crisis_case(stage="pending_sign_off")  # type: ignore[operator]
    setup_db_results([[case]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases?stage=pending_sign_off")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["stage"] == "pending_sign_off"


def test_list_cases_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases")
    assert r.status_code == 403


# ─── GET /cases/{case_id} ───────────────────────────────────────


def test_get_case_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
) -> None:
    case = make_crisis_case()  # type: ignore[operator]
    setup_db_results([case])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _CASE_ID


def test_get_case_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}")
    assert r.status_code == 404


def test_get_case_invalid_uuid_400(admin_org_client: TestClient) -> None:
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases/not-a-uuid")
    assert r.status_code == 400


# ─── GET /cases/by-episode/{episode_id} ────────────────────────


def test_get_by_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
) -> None:
    case = make_crisis_case()  # type: ignore[operator]
    setup_db_results([case])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases/by-episode/{_EPISODE_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _CASE_ID


def test_get_by_episode_returns_null_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """没有匹配 → 返 None (而非 404), 与 Node 一致 — UI 不渲染危机模块即可."""
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/cases/by-episode/{_EPISODE_ID}")
    assert r.status_code == 200
    assert r.json() is None


# ─── PUT /cases/{case_id}/checklist/{step_key} ─────────────────


def test_update_step_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
    mock_db: AsyncMock,
) -> None:
    """更新 reinterview 步骤为 done=True."""
    case = make_crisis_case()  # type: ignore[operator]
    setup_db_results([case])
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/checklist/reinterview",
        json={"done": True, "summary": "已完成重新访谈"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "reinterview" in body["checklist"]
    assert body["checklist"]["reinterview"]["done"] is True
    mock_db.commit.assert_awaited()


def test_update_step_invalid_step_key_400(
    admin_org_client: TestClient,
) -> None:
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/checklist/notARealStep",
        json={"done": True},
    )
    assert r.status_code == 400


def test_update_step_closed_case_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_crisis_case: object,
) -> None:
    case = make_crisis_case(stage="closed")  # type: ignore[operator]
    setup_db_results([case])
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/checklist/reinterview",
        json={"done": True},
    )
    assert r.status_code == 400


def test_update_step_403_when_client(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.put(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/checklist/reinterview",
        json={"done": True},
    )
    assert r.status_code == 403


# ─── POST /cases/{case_id}/submit ──────────────────────────────


def test_submit_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/submit",
        json={"closureSummary": "X"},
    )
    assert r.status_code == 403


def test_submit_validation_missing_summary(admin_org_client: TestClient) -> None:
    """Pydantic min_length=1 校验, error_handler 转 422 → 400."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/submit",
        json={"closureSummary": ""},
    )
    assert r.status_code == 400


# ─── POST /cases/{case_id}/sign-off ────────────────────────────


def test_sign_off_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/crisis/cases/{_CASE_ID}/sign-off",
        json={"approve": True},
    )
    assert r.status_code == 403


# ─── GET /stats ────────────────────────────────────────────────


def test_stats_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/crisis/stats")
    assert r.status_code == 403
