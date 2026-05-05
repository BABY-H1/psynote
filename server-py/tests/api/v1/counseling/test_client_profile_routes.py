"""
Client profile router tests — 镜像 ``server/src/modules/counseling/client-profile.routes.ts``。

Endpoints (3):
  GET    /{user_id}/profile    — 获取来访者档案 (PHI access log!)
  PUT    /{user_id}/profile    — upsert 档案
  GET    /{user_id}/summary    — 个案摘要 (PHI access log!)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.counseling.conftest import SetupDbResults

_ORG_ID = "00000000-0000-0000-0000-000000000099"
_TARGET_USER_ID = "00000000-0000-0000-0000-000000000010"


# ─── GET /{user_id}/profile ────────────────────────────────────


def test_get_profile_happy_records_phi(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_client_profile: object,
) -> None:
    p = make_client_profile()  # type: ignore[operator]
    setup_db_results([p])

    with patch(
        "app.api.v1.counseling.client_profile_router.record_phi_access",
        new_callable=AsyncMock,
    ) as mock_phi:
        r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile")

    assert r.status_code == 200
    mock_phi.assert_awaited_once()
    assert mock_phi.await_args is not None
    assert mock_phi.await_args.kwargs["resource"] == "client_profiles"
    assert mock_phi.await_args.kwargs["data_class"] == "phi_full"


def test_get_profile_returns_null_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile")
    assert r.status_code == 200
    assert r.json() is None


def test_get_profile_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile")
    assert r.status_code == 403


# ─── PUT /{user_id}/profile (upsert) ───────────────────────────


def test_upsert_profile_creates_when_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([None])  # not existing
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile",
        json={"phone": "13800138000", "gender": "F"},
    )
    assert r.status_code == 200
    mock_db.commit.assert_awaited()


def test_upsert_profile_updates_when_exists(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_client_profile: object,
) -> None:
    existing = make_client_profile()  # type: ignore[operator]
    setup_db_results([existing])
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile",
        json={"phone": "13800138000", "gender": "M"},
    )
    assert r.status_code == 200
    assert existing.phone == "13800138000"
    assert existing.gender == "M"


def test_upsert_profile_403_when_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.put(
        f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/profile",
        json={"phone": "x"},
    )
    assert r.status_code == 403


# ─── GET /{user_id}/summary ───────────────────────────────────


def test_get_summary_happy_records_phi(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_client_profile: object,
    make_user_row: object,
    make_episode: object,
) -> None:
    p = make_client_profile()  # type: ignore[operator]
    u = make_user_row(name="Alice")  # type: ignore[operator]
    e = make_episode()  # type: ignore[operator]
    # 顺序: profile, user, episodes list, results list
    setup_db_results([p, (u.name, u.email, u.avatar_url), [e], []])

    with patch(
        "app.api.v1.counseling.client_profile_router.record_phi_access",
        new_callable=AsyncMock,
    ) as mock_phi:
        r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/summary")

    assert r.status_code == 200
    body = r.json()
    assert body["user"]["name"] == "Alice"
    assert len(body["activeEpisodes"]) == 1
    mock_phi.assert_awaited_once()


def test_get_summary_no_org_403(authed_client: TestClient) -> None:
    r = authed_client.get(f"/api/orgs/{_ORG_ID}/clients/{_TARGET_USER_ID}/summary")
    assert r.status_code == 403
