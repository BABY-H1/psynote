"""
Admin license routes — 镜像 ``admin-license.routes.ts``.

Phase 3 Tier 4 stub tests:
  - GET    /api/admin/licenses/         — 全 org + license status
  - POST   /api/admin/licenses/issue    — 颁发 (sysadm + tier 校验 + months 校验)
  - POST   /api/admin/licenses/renew    — 续期 (基于现有 license 解析)
  - POST   /api/admin/licenses/modify   — 改 tier / maxSeats
  - POST   /api/admin/licenses/revoke   — 撤销
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.admin.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


# ─── List ──────────────────────────────────────────────────────────


def test_list_licenses_requires_auth(client: TestClient) -> None:
    r = client.get("/api/admin/licenses/")
    assert r.status_code == 401


def test_list_licenses_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/licenses/")
    assert r.status_code == 403


def test_list_licenses_empty(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """orgs_q + member_q 各空 → []."""
    setup_db_results([[], []])
    r = sysadm_client.get("/api/admin/licenses/")
    assert r.status_code == 200
    assert r.json() == []


# ─── Issue ─────────────────────────────────────────────────────────


def test_issue_invalid_tier(sysadm_client: TestClient) -> None:
    r = sysadm_client.post(
        "/api/admin/licenses/issue",
        json={
            "orgId": _ORG_ID,
            "tier": "platinum",  # not in VALID_TIERS
            "maxSeats": 10,
            "months": 12,
        },
    )
    assert r.status_code == 400


def test_issue_months_out_of_range(sysadm_client: TestClient) -> None:
    """Pydantic le=120 catches."""
    r = sysadm_client.post(
        "/api/admin/licenses/issue",
        json={
            "orgId": _ORG_ID,
            "tier": "starter",
            "maxSeats": 10,
            "months": 200,
        },
    )
    assert r.status_code == 400


def test_issue_org_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.post(
        "/api/admin/licenses/issue",
        json={
            "orgId": _ORG_ID,
            "tier": "starter",
            "maxSeats": 10,
            "months": 12,
        },
    )
    assert r.status_code == 404


def test_issue_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/issue",
        json={
            "orgId": _ORG_ID,
            "tier": "growth",
            "maxSeats": 25,
            "months": 12,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["tier"] == "growth"
    assert body["maxSeats"] == 25
    assert body["token"].startswith("license_v3|")
    assert org.license_key.startswith("license_v3|")
    assert org.plan == "pro"  # tier=growth → plan=pro
    mock_db.commit.assert_awaited()


# ─── Renew ─────────────────────────────────────────────────────────


def test_renew_no_license(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """org 无 license → 400."""
    org = make_org(license_key=None)  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/renew",
        json={"orgId": _ORG_ID, "months": 12},
    )
    assert r.status_code == 400


def test_renew_invalid_token(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """老格式 license key 没法 parse → 400."""
    org = make_org(license_key="legacy-jwt-token")  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/renew",
        json={"orgId": _ORG_ID, "months": 12},
    )
    assert r.status_code == 400


def test_renew_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    """有合法 stub token + months → 新 token, 延期 (BUG-003 fix: 从未来 expiry 起算)."""
    future_expiry = datetime.now(UTC) + timedelta(days=180)
    issued = datetime.now(UTC) - timedelta(days=30)
    token = f"license_v3|{_ORG_ID}|starter|10|{future_expiry.isoformat()}|{issued.isoformat()}"
    org = make_org(license_key=token)  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/renew",
        json={"orgId": _ORG_ID, "months": 12},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "starter"
    assert body["maxSeats"] == 10
    new_expiry = datetime.fromisoformat(body["expiresAt"])
    # 新 expiry > 旧 expiry (BUG-003: 从 future_expiry 起加 12 月)
    assert new_expiry > future_expiry
    mock_db.commit.assert_awaited()


# ─── Modify ────────────────────────────────────────────────────────


def test_modify_no_license(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org(license_key=None)  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/modify",
        json={"orgId": _ORG_ID, "tier": "growth"},
    )
    assert r.status_code == 400


def test_modify_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    expiry = datetime.now(UTC) + timedelta(days=300)
    issued = datetime.now(UTC) - timedelta(days=30)
    token = f"license_v3|{_ORG_ID}|starter|5|{expiry.isoformat()}|{issued.isoformat()}"
    org = make_org(license_key=token, plan="free")  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/modify",
        json={"orgId": _ORG_ID, "tier": "flagship", "maxSeats": 50},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "flagship"
    assert body["maxSeats"] == 50
    # plan 同步
    assert org.plan == "enterprise"
    mock_db.commit.assert_awaited()


# ─── Revoke ────────────────────────────────────────────────────────


def test_revoke_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.post(
        "/api/admin/licenses/revoke",
        json={"orgId": _ORG_ID},
    )
    assert r.status_code == 404


def test_revoke_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org(license_key="license_v3|fake")  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.post(
        "/api/admin/licenses/revoke",
        json={"orgId": _ORG_ID},
    )
    assert r.status_code == 200
    assert r.json() == {"success": True}
    assert org.license_key is None
    mock_db.commit.assert_awaited()


def test_revoke_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.post(
        "/api/admin/licenses/revoke",
        json={"orgId": _ORG_ID},
    )
    assert r.status_code == 403
