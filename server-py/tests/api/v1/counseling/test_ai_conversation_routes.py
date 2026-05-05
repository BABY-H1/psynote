"""
AI conversation router tests — 镜像
``server/src/modules/counseling/ai-conversation.routes.ts``。

Endpoints (5):
  GET    /                  — list (counselor 仅自己; admin 全部)
  GET    /{id}              — detail (PHI access log!)
  POST   /                  — create
  PATCH  /{id}              — update (含 sessionNoteId 关联)
  DELETE /{id}              — delete
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CONV_ID = "00000000-0000-0000-0000-000000000bbb"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_conversations_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_ai_conversation: object,
) -> None:
    c = make_ai_conversation()  # type: ignore[operator]
    setup_db_results([[c]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/ai-conversations/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_conversations_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/ai-conversations/")
    assert r.status_code == 403


# ─── GET /{id} (PHI access log!) ──────────────────────────────


def test_get_conversation_happy_records_phi(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_ai_conversation: object,
) -> None:
    """PHI: 含逐字稿 → 必须 record_phi_access(action='view')."""
    c = make_ai_conversation()  # type: ignore[operator]
    # 主查 conv → conv; 然后查 episode.client_id → (UUID,)
    setup_db_results([c, (uuid.UUID("00000000-0000-0000-0000-000000000010"),)])

    with patch(
        "app.api.v1.counseling.ai_conversation_router.record_phi_access",
        new_callable=AsyncMock,
    ) as mock_phi:
        r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}")

    assert r.status_code == 200
    mock_phi.assert_awaited_once()
    assert mock_phi.await_args is not None
    assert mock_phi.await_args.kwargs["resource"] == "ai_conversations"
    assert mock_phi.await_args.kwargs["data_class"] == "phi_full"


def test_get_conversation_404(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_conversation_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai-conversations/",
        json={"careEpisodeId": "00000000-0000-0000-0000-000000000111", "mode": "note"},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_conversation_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/ai-conversations/",
        json={"careEpisodeId": "00000000-0000-0000-0000-000000000111", "mode": "note"},
    )
    assert r.status_code == 403


# ─── PATCH /{id} ───────────────────────────────────────────────


def test_update_conversation_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_ai_conversation: object,
) -> None:
    c = make_ai_conversation()  # type: ignore[operator]
    setup_db_results([c])
    r = counselor_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}",
        json={"title": "新标题"},
    )
    assert r.status_code == 200
    assert c.title == "新标题"


def test_update_conversation_with_session_note_id(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_ai_conversation: object,
) -> None:
    """Phase I Issue 1: PATCH sessionNoteId 关联到 saved note."""
    c = make_ai_conversation()  # type: ignore[operator]
    setup_db_results([c])
    note_id = "00000000-0000-0000-0000-000000000444"
    r = counselor_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}",
        json={"sessionNoteId": note_id},
    )
    assert r.status_code == 200
    assert str(c.session_note_id) == note_id


def test_update_conversation_404(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.patch(
        f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}",
        json={"title": "x"},
    )
    assert r.status_code == 404


# ─── DELETE /{id} ──────────────────────────────────────────────


def test_delete_conversation_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_ai_conversation: object,
    mock_db: AsyncMock,
) -> None:
    c = make_ai_conversation()  # type: ignore[operator]
    setup_db_results([c, None])
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_conversation_404(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/ai-conversations/{_CONV_ID}")
    assert r.status_code == 404
