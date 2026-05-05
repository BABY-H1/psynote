"""
Branding routes — 镜像 ``branding.routes.ts``.

Phase 3 smoke tests:
  - GET   /api/orgs/{id}/branding/   — 任意 staff 可读 (rejectClient)
  - PATCH /api/orgs/{id}/branding/   — admin only + branding feature gate
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"


def test_get_branding_empty_when_unset(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """settings.branding 不存在 → 全空字段."""
    setup_db_results([({},)])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/branding/")
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "logoUrl": None,
        "themeColor": None,
        "reportHeader": None,
        "reportFooter": None,
    }


def test_get_branding_existing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results(
        [
            (
                {
                    "branding": {
                        "logoUrl": "https://cdn/x.png",
                        "themeColor": "#6366f1",
                    }
                },
            )
        ]
    )
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/branding/")
    assert r.status_code == 200
    body = r.json()
    assert body["logoUrl"] == "https://cdn/x.png"
    assert body["themeColor"] == "#6366f1"


def test_get_branding_rejects_client(client_role_org_client: TestClient) -> None:
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}/branding/")
    assert r.status_code == 403


def test_patch_branding_starter_tier_403(
    admin_org_client: TestClient,
) -> None:
    """starter tier 不含 branding feature → 403."""
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/branding/",
        json={"logoUrl": "https://cdn/new.png"},
    )
    assert r.status_code == 403


def test_patch_branding_with_growth_tier(
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
    client: TestClient,
) -> None:
    """growth tier 含 branding feature → 允许; merge 不破坏其它 settings."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import LicenseInfo, OrgContext, get_org_context

    growth_org = OrgContext(
        org_id=_ORG_ID,
        org_type="counseling",
        role="org_admin",
        role_v2="clinic_admin",
        member_id="member-x",
        full_practice_access=True,
        tier="growth",
        license=LicenseInfo(status="none"),
    )
    fake_user = AuthUser(
        id="00000000-0000-0000-0000-000000000001",
        email="admin@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_org_context] = lambda: growth_org
    try:
        org = make_org(  # type: ignore[operator]
            settings={"publicServices": ["x"], "branding": {"themeColor": "#000"}}
        )
        setup_db_results([org])
        r = client.patch(
            f"/api/orgs/{_ORG_ID}/branding/",
            json={"logoUrl": "https://cdn/logo.png"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["logoUrl"] == "https://cdn/logo.png"
        # merge 保留旧字段
        assert body["themeColor"] == "#000"
        # 验证 publicServices 没被破坏
        assert org.settings["publicServices"] == ["x"]
        mock_db.commit.assert_awaited()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_org_context, None)
