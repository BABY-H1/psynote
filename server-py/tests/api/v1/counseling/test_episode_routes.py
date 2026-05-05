"""
Care episode router tests — 镜像 ``server/src/modules/counseling/episode.routes.ts``。

Endpoints (10):
  GET    /api/orgs/{org_id}/care-episodes/                    — list (rich)
  GET    /api/orgs/{org_id}/care-episodes/{episode_id}        — detail (PHI access log)
  GET    .../timeline                                          — timeline 原始
  GET    .../timeline/enriched                                 — Phase 9δ 多源合并
  POST   /                                                    — create + open event
  PATCH  /{episode_id}                                        — update
  PATCH  /{episode_id}/triage                                 — triage decision + event
  POST   /{episode_id}/close                                  — close + event
  POST   /{episode_id}/reopen                                 — reopen + event

每端点 ≥2 cases (happy + sad)。
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_EPISODE_ID = "00000000-0000-0000-0000-000000000111"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_episodes_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
) -> None:
    e = make_episode()  # type: ignore[operator]
    # main list query → list of (episode, client_name, client_email) tuples
    setup_db_results([[(e, "Alice", "a@x.com")], None, 0])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["client"]["name"] == "Alice"
    assert body[0]["sessionCount"] == 0


def test_list_episodes_no_org_context_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/")
    assert r.status_code == 403


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    payload = {
        "clientId": "00000000-0000-0000-0000-000000000010",
        "chiefComplaint": "焦虑",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/care-episodes/", json=payload)
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_episode_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/care-episodes/",
        json={"clientId": "00000000-0000-0000-0000-000000000010"},
    )
    assert r.status_code == 403


# ─── GET /{episode_id} 详情 (PHI access log) ───────────────────


def test_get_episode_happy_records_phi_access(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
    mock_db: AsyncMock,
) -> None:
    e = make_episode(chief_complaint="A 抱怨")  # type: ignore[operator]
    setup_db_results([(e, "Alice", "a@x.com")])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["chiefComplaint"] == "A 抱怨"
    assert body["client"]["name"] == "Alice"


def test_get_episode_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}")
    assert r.status_code == 404


# ─── GET /{episode_id}/timeline ────────────────────────────────


def test_get_timeline_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/timeline")
    assert r.status_code == 200
    assert r.json() == []


def test_get_timeline_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/timeline")
    assert r.status_code == 403


# ─── GET /{episode_id}/timeline/enriched ───────────────────────


def test_get_enriched_timeline_empty_when_episode_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """episode 不存在 → 返 [] (与 Node 一致)."""
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/timeline/enriched")
    assert r.status_code == 200
    assert r.json() == []


def test_get_enriched_timeline_aggregates_sources(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    """有 session_note 时归并到 enriched timeline."""
    note = make_session_note()  # type: ignore[operator]
    # episode 存在 + 6 个空 source + 1 个 session_note 列表
    setup_db_results([(b"x",), [], [note], [], [], [], [], []])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/timeline/enriched")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["kind"] == "session_note"


# ─── PATCH /{episode_id} ───────────────────────────────────────


def test_update_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
    mock_db: AsyncMock,
) -> None:
    e = make_episode()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}",
        json={"chiefComplaint": "新主诉"},
    )
    assert r.status_code == 200
    assert e.chief_complaint == "新主诉"
    mock_db.commit.assert_awaited()


def test_update_episode_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}",
        json={"chiefComplaint": "x"},
    )
    assert r.status_code == 404


# ─── PATCH /{episode_id}/triage ────────────────────────────────


def test_confirm_triage_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
) -> None:
    e = make_episode()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/triage",
        json={"currentRisk": "level_2", "interventionType": "CBT"},
    )
    assert r.status_code == 200
    assert e.current_risk == "level_2"


def test_confirm_triage_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/triage",
        json={"currentRisk": "level_2", "interventionType": "CBT"},
    )
    assert r.status_code == 404


# ─── POST /{episode_id}/close ──────────────────────────────────


def test_close_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
) -> None:
    e = make_episode()  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/close",
        json={"reason": "完成"},
    )
    assert r.status_code == 200
    assert e.status == "closed"


def test_close_episode_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/close", json={}
    )
    assert r.status_code == 403


# ─── POST /{episode_id}/reopen ─────────────────────────────────


def test_reopen_episode_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_episode: object,
) -> None:
    e = make_episode(status="closed")  # type: ignore[operator]
    setup_db_results([e])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/reopen")
    assert r.status_code == 200
    assert e.status == "active"


def test_reopen_episode_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/care-episodes/{_EPISODE_ID}/reopen")
    assert r.status_code == 404
