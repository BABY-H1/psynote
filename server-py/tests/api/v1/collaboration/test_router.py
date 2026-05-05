"""
Collaboration 路由测试 — 镜像 ``server/src/modules/collaboration/collaboration.routes.ts``。

Endpoints (6):
  GET   /unassigned-clients              — org_admin only
  GET   /assignments                     — org_admin / counselor
  GET   /pending-notes                   — org_admin (全部) / counselor (supervisees)
  POST  /pending-notes/{note_id}/review  — approve / reject
  GET   /audit                           — audit_logs 查询 (org_admin only)
  GET   /phi-access                      — phi_access_logs 查询 (org_admin only)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.collaboration.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_NOTE_ID = "00000000-0000-0000-0000-000000000444"


# ─── GET /unassigned-clients ────────────────────────────────────


def test_unassigned_clients_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    row = {
        "id": "00000000-0000-0000-0000-000000000010",
        "name": "Alice",
        "email": "alice@x.com",
        "joined_at": datetime(2026, 4, 1, tzinfo=UTC),
    }
    setup_db_results([[row]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/unassigned-clients")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["name"] == "Alice"


def test_unassigned_clients_403_for_counselor(
    counselor_org_client: TestClient,
) -> None:
    """org_admin only — counselor 应 403."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/unassigned-clients")
    assert r.status_code == 403


def test_unassigned_clients_403_for_client(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/unassigned-clients")
    assert r.status_code == 403


# ─── GET /assignments ────────────────────────────────────────────


def test_assignments_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    row = {
        "id": "00000000-0000-0000-0000-000000000888",
        "client_id": "00000000-0000-0000-0000-000000000010",
        "counselor_id": "00000000-0000-0000-0000-000000000001",
        "is_primary": True,
        "assigned_at": datetime(2026, 3, 1, tzinfo=UTC),
        "client_name": "Alice",
        "counselor_name": "咨询师 A",
    }
    setup_db_results([[row]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/assignments")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["isPrimary"] is True
    assert body[0]["clientName"] == "Alice"


def test_assignments_403_for_client(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/assignments")
    assert r.status_code == 403


# ─── GET /pending-notes ──────────────────────────────────────────


def test_pending_notes_admin_sees_all(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """org_admin 走 admin 分支 (无 supervisor filter)."""
    row = {
        "id": _NOTE_ID,
        "client_id": "00000000-0000-0000-0000-000000000010",
        "counselor_id": "00000000-0000-0000-0000-000000000001",
        "session_date": datetime(2026, 4, 1, tzinfo=UTC).date(),
        "note_format": "soap",
        "status": "submitted_for_review",
        "submitted_for_review_at": datetime(2026, 4, 2, tzinfo=UTC),
        "summary": "会谈摘要",
        "client_name": "Alice",
        "counselor_name": "咨询师 A",
    }
    setup_db_results([[row]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/pending-notes")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["status"] == "submitted_for_review"
    assert body[0]["counselorName"] == "咨询师 A"


def test_pending_notes_counselor_filtered_by_supervisees(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """非 admin 走带 supervisor_id filter 的子查询分支."""
    setup_db_results([[]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/pending-notes")
    assert r.status_code == 200
    assert r.json() == []


def test_pending_notes_403_for_client(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/pending-notes")
    assert r.status_code == 403


# ─── POST /pending-notes/{note_id}/review ───────────────────────


def test_review_approve_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: Any,
    mock_db: AsyncMock,
) -> None:
    note = make_session_note()
    setup_db_results([note])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/collaboration/pending-notes/{_NOTE_ID}/review",
        json={"decision": "approve"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "reviewed"
    mock_db.commit.assert_awaited()


def test_review_reject_writes_annotation(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_session_note: Any,
) -> None:
    note = make_session_note()
    setup_db_results([note])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/collaboration/pending-notes/{_NOTE_ID}/review",
        json={"decision": "reject", "annotation": "缺少风险评估"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "draft"
    assert body["supervisorAnnotation"] == "缺少风险评估"


def test_review_invalid_decision_400(
    admin_org_client: TestClient,
) -> None:
    """decision 不在 enum → Pydantic 校验 → 400."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/collaboration/pending-notes/{_NOTE_ID}/review",
        json={"decision": "maybe"},
    )
    assert r.status_code == 400


def test_review_note_not_found_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """note SELECT 返 None → ValidationError 400 (与 Node 一致)。"""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/collaboration/pending-notes/{_NOTE_ID}/review",
        json={"decision": "approve"},
    )
    assert r.status_code == 400


# ─── GET /audit ──────────────────────────────────────────────────


def test_audit_org_admin_only(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/audit")
    assert r.status_code == 403


def test_audit_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_audit_log: Any,
) -> None:
    log = make_audit_log()
    setup_db_results([[log]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/audit?action=create")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["action"] == "create"


def test_audit_with_filters_clamp_limit(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """``limit=9999`` 被 clamp 到 500; 不影响响应 (服务端不暴露 cap)。"""
    setup_db_results([[]])
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/collaboration/audit?limit=9999"
        "&since=2026-01-01T00:00:00Z&until=2026-12-31T23:59:59Z"
    )
    assert r.status_code == 200


# ─── GET /phi-access ─────────────────────────────────────────────


def test_phi_access_org_admin_only(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/phi-access")
    assert r.status_code == 403


def test_phi_access_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_phi_access_log: Any,
) -> None:
    log = make_phi_access_log()
    setup_db_results([[log]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/collaboration/phi-access")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["dataClass"] == "phi_full"
    assert body[0]["action"] == "view"
