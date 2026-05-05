"""
Appointment router tests — 镜像 ``server/src/modules/counseling/appointment.routes.ts``。

Endpoints (4):
  GET    /api/orgs/{org_id}/appointments/                   — list (joined client name)
  GET    /api/orgs/{org_id}/appointments/{appointment_id}   — detail
  POST   /                                                  — create + (可选) timeline
  PATCH  /{appointment_id}/status                           — status change + timeline

每端点 ≥2 cases.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_APPT_ID = "00000000-0000-0000-0000-000000000222"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_appointments_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_appointment: object,
) -> None:
    a = make_appointment()  # type: ignore[operator]
    setup_db_results([[(a, "Alice")]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/appointments/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["clientName"] == "Alice"


def test_list_appointments_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/appointments/")
    assert r.status_code == 403


# ─── GET /{appointment_id} 详情 ────────────────────────────────


def test_get_appointment_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_appointment: object,
) -> None:
    a = make_appointment(status="confirmed")  # type: ignore[operator]
    setup_db_results([a])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/appointments/{_APPT_ID}")
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


def test_get_appointment_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/appointments/{_APPT_ID}")
    assert r.status_code == 404


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_appointment_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([])
    payload = {
        "clientId": "00000000-0000-0000-0000-000000000010",
        "startTime": "2026-05-01T09:00:00",
        "endTime": "2026-05-01T10:00:00",
    }
    r = admin_org_client.post(f"/api/orgs/{_ORG_ID}/appointments/", json=payload)
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_appointment_missing_client_id_400(admin_org_client: TestClient) -> None:
    """缺 clientId → 400 (Pydantic 校验)."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/appointments/",
        json={"startTime": "2026-05-01T09:00:00", "endTime": "2026-05-01T10:00:00"},
    )
    assert r.status_code == 400


def test_create_appointment_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG_ID}/appointments/",
        json={
            "clientId": "00000000-0000-0000-0000-000000000010",
            "startTime": "2026-05-01T09:00:00",
            "endTime": "2026-05-01T10:00:00",
        },
    )
    assert r.status_code == 403


# ─── PATCH /{appointment_id}/status ────────────────────────────


def test_update_status_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_appointment: object,
) -> None:
    a = make_appointment()  # type: ignore[operator]
    setup_db_results([a])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/appointments/{_APPT_ID}/status",
        json={"status": "confirmed"},
    )
    assert r.status_code == 200
    assert a.status == "confirmed"


def test_update_status_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/appointments/{_APPT_ID}/status",
        json={"status": "confirmed"},
    )
    assert r.status_code == 404
