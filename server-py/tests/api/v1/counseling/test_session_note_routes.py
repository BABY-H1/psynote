"""
Session note router tests — 镜像 ``server/src/modules/counseling/session-note.routes.ts``。

⚠ PHI 核心模块 — 含 PHI access log 验证。

Endpoints (4):
  GET    /                — list
  GET    /{note_id}       — detail (PHI access log!)
  POST   /                — create + (可选) timeline
  PATCH  /{note_id}       — update (PHI access log!)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_NOTE_ID = "00000000-0000-0000-0000-000000000444"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_session_notes_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    n = make_session_note()  # type: ignore[operator]
    setup_db_results([[n]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/session-notes/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_session_notes_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/session-notes/")
    assert r.status_code == 403


# ─── GET /{note_id} 详情 (PHI access log!) ─────────────────────


def test_get_session_note_happy_records_phi(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    """PHI 关键: 调用 record_phi_access(action='view', resource='session_notes')."""
    n = make_session_note(summary="今日会谈")  # type: ignore[operator]
    setup_db_results([n])

    with patch(
        "app.api.v1.counseling.session_note_router.record_phi_access",
        new_callable=AsyncMock,
    ) as mock_phi:
        r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/session-notes/{_NOTE_ID}")

    assert r.status_code == 200
    assert r.json()["summary"] == "今日会谈"
    mock_phi.assert_awaited_once()
    assert mock_phi.await_args is not None
    call_kwargs = mock_phi.await_args.kwargs
    assert call_kwargs["action"] == "view"
    assert call_kwargs["resource"] == "session_notes"
    assert call_kwargs["data_class"] == "phi_full"
    assert call_kwargs["resource_id"] == _NOTE_ID


def test_get_session_note_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/session-notes/{_NOTE_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_session_note_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    payload = {
        "clientId": "00000000-0000-0000-0000-000000000010",
        "sessionDate": "2026-05-01",
        "subjective": "客户说...",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/session-notes/", json=payload)
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_session_note_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/session-notes/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "sessionDate": "2026-05-01",
        },
    )
    assert r.status_code == 403


def test_create_session_note_writes_timeline_when_episode_provided(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """careEpisodeId provided → adds CareTimeline event."""
    setup_db_results([])
    payload = {
        "clientId": "00000000-0000-0000-0000-000000000010",
        "careEpisodeId": "00000000-0000-0000-0000-000000000111",
        "sessionDate": "2026-05-01",
        "noteFormat": "soap",
        "summary": "今天讨论了焦虑应对",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/session-notes/", json=payload)
    assert r.status_code == 201
    # 应至少 add 2 次 (note + timeline)
    assert mock_db.add.call_count >= 2


# ─── PATCH /{note_id} (PHI access log!) ────────────────────────


def test_update_session_note_happy_records_phi(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: object,
) -> None:
    """PATCH 也算 PHI 触达。"""
    n = make_session_note()  # type: ignore[operator]
    setup_db_results([n])

    with patch(
        "app.api.v1.counseling.session_note_router.record_phi_access",
        new_callable=AsyncMock,
    ) as mock_phi:
        r = admin_org_client.patch(
            f"/api/orgs/{_ORG_ID}/session-notes/{_NOTE_ID}",
            json={"summary": "新摘要"},
        )

    assert r.status_code == 200
    assert n.summary == "新摘要"
    mock_phi.assert_awaited_once()


def test_update_session_note_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/session-notes/{_NOTE_ID}",
        json={"summary": "x"},
    )
    assert r.status_code == 404
