"""
Availability router tests — 镜像 ``server/src/modules/counseling/availability.routes.ts``。

Endpoints (5):
  GET    /                — list (counselor 自己 / admin 指定)
  GET    /slots           — 计算空闲时段
  POST   /                — create (overlap check)
  PATCH  /{slot_id}       — update
  DELETE /{slot_id}       — delete

每端点 ≥2 cases.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_SLOT_ID = "00000000-0000-0000-0000-000000000333"


# ─── GET / 列表 ──────────────────────────────────────────────────


def test_list_availability_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_availability: object,
) -> None:
    s = make_availability()  # type: ignore[operator]
    setup_db_results([[s]])
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/availability/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["startTime"] == "09:00"


def test_list_availability_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/availability/")
    assert r.status_code == 403


# ─── GET /slots ────────────────────────────────────────────────


def test_list_free_slots_missing_counselor_400(admin_org_client: TestClient) -> None:
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/availability/slots?date=2026-05-01")
    assert r.status_code == 400


def test_list_free_slots_missing_date_400(admin_org_client: TestClient) -> None:
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/availability/slots?counselorId=00000000-0000-0000-0000-000000000001"
    )
    assert r.status_code == 400


def test_list_free_slots_no_active_slots_returns_empty(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])  # 没 active slots
    r = admin_org_client.get(
        f"/api/orgs/{_ORG_ID}/availability/slots"
        "?counselorId=00000000-0000-0000-0000-000000000001&date=2026-05-01"
    )
    assert r.status_code == 200
    assert r.json() == []


# ─── POST / 创建 ────────────────────────────────────────────────


def test_create_availability_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([[]])  # 无现有 slots, 无 overlap
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/availability/",
        json={"dayOfWeek": 1, "startTime": "14:00", "endTime": "15:00"},
    )
    assert r.status_code == 201
    mock_db.commit.assert_awaited()


def test_create_availability_invalid_day_of_week_400(
    counselor_org_client: TestClient,
) -> None:
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/availability/",
        json={"dayOfWeek": 7, "startTime": "14:00", "endTime": "15:00"},
    )
    assert r.status_code == 400


def test_create_availability_start_ge_end_400(counselor_org_client: TestClient) -> None:
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/availability/",
        json={"dayOfWeek": 1, "startTime": "15:00", "endTime": "14:00"},
    )
    assert r.status_code == 400


def test_create_availability_overlap_409(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_availability: object,
) -> None:
    """已有 slot 09:00-10:00, 新 slot 09:30-10:30 重叠 → 409."""
    existing = make_availability(start_time="09:00", end_time="10:00", day_of_week=1)  # type: ignore[operator]
    setup_db_results([[existing]])
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/availability/",
        json={"dayOfWeek": 1, "startTime": "09:30", "endTime": "10:30"},
    )
    assert r.status_code == 409


# ─── PATCH /{slot_id} ──────────────────────────────────────────


def test_update_availability_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_availability: object,
) -> None:
    s = make_availability()  # type: ignore[operator]
    setup_db_results([s])  # 主查 slot, 无 update body 不查 others
    r = counselor_org_client.patch(
        f"/api/orgs/{_ORG_ID}/availability/{_SLOT_ID}",
        json={"sessionType": "online"},
    )
    assert r.status_code == 200


def test_update_availability_404(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.patch(
        f"/api/orgs/{_ORG_ID}/availability/{_SLOT_ID}",
        json={"sessionType": "online"},
    )
    assert r.status_code == 404


# ─── DELETE /{slot_id} ─────────────────────────────────────────


def test_delete_availability_happy(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_availability: object,
    mock_db: AsyncMock,
) -> None:
    s = make_availability()  # type: ignore[operator]
    setup_db_results([s, None])
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/availability/{_SLOT_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_availability_404(
    counselor_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/availability/{_SLOT_ID}")
    assert r.status_code == 404
