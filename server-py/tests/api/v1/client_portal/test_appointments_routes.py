"""GET /appointments + POST /appointment-requests 测试."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.client_portal.conftest import SetupDbResults

_ORG = "00000000-0000-0000-0000-000000000099"
_COUNSELOR = "00000000-0000-0000-0000-0000000000aa"
_CHILD = "00000000-0000-0000-0000-000000000002"


def test_list_appointments_self_only_filter(
    client_role_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_appointment: object,
) -> None:
    appts = [make_appointment()]  # type: ignore[operator]
    setup_db_results([appts])
    r = client_role_org_client.get(f"/api/orgs/{_ORG}/client/appointments")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1


def test_create_appointment_request_happy(
    client_role_org_client: TestClient,
    mock_db: AsyncMock,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/appointment-requests",
        json={
            "counselorId": _COUNSELOR,
            "startTime": "2026-06-01T10:00:00Z",
            "endTime": "2026-06-01T11:00:00Z",
            "type": "online",
            "notes": "first session",
        },
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_appointment_request_invalid_iso_returns_400(
    client_role_org_client: TestClient,
) -> None:
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/appointment-requests",
        json={
            "counselorId": _COUNSELOR,
            "startTime": "not-a-date",
            "endTime": "2026-06-01T11:00:00Z",
        },
    )
    assert r.status_code == 400


def test_appointment_request_rejects_as_param(
    client_role_org_client: TestClient,
) -> None:
    """guardian-blocked: ?as= 与 caller 不同 → 403."""
    r = client_role_org_client.post(
        f"/api/orgs/{_ORG}/client/appointment-requests?as={_CHILD}",
        json={
            "counselorId": _COUNSELOR,
            "startTime": "2026-06-01T10:00:00Z",
            "endTime": "2026-06-01T11:00:00Z",
        },
    )
    assert r.status_code == 403
