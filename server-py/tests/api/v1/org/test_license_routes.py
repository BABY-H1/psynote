"""
License routes — 镜像 ``license.routes.ts``.

Phase 3 stub tests (license JWT 验证 Phase 5 接入):
  - POST   /api/orgs/{id}/license/   — 激活 (admin only, 当前 stub 接受任意 key)
  - DELETE /api/orgs/{id}/license/   — 移除 (admin only)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


def test_activate_license_admin_only(counselor_org_client: TestClient) -> None:
    r = counselor_org_client.post(
        f"/api/orgs/{_ORG_ID}/license/",
        json={"licenseKey": "fake-license"},
    )
    assert r.status_code == 403


def test_activate_license_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    """Phase 3 stub: 接受任意 key, tier 取自 OrgContext (starter)."""
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/license/",
        json={"licenseKey": "any-fake-key-for-phase-3"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["tier"] == "starter"
    assert org.license_key == "any-fake-key-for-phase-3"
    mock_db.commit.assert_awaited()


def test_activate_license_validates_non_empty(
    admin_org_client: TestClient,
) -> None:
    """Pydantic min_length=1 应 catch 空字符串."""
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/license/",
        json={"licenseKey": ""},
    )
    assert r.status_code == 400


def test_remove_license_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org(license_key="existing")  # type: ignore[operator]
    setup_db_results([org])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/license/")
    assert r.status_code == 200
    assert r.json() == {"success": True}
    assert org.license_key is None
    mock_db.commit.assert_awaited()


def test_remove_license_admin_only(counselor_org_client: TestClient) -> None:
    r = counselor_org_client.delete(f"/api/orgs/{_ORG_ID}/license/")
    assert r.status_code == 403


def test_remove_license_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/license/")
    assert r.status_code == 404
