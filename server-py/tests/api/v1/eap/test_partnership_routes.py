"""
EAP Partnership routes tests — 镜像 ``server/src/modules/eap/eap-partnership.routes.ts`` 5 endpoints.

覆盖:
  - GET / (list happy + admin guard)
  - POST / (create happy + dup + provider not found + admin guard)
  - GET /:id (detail happy + not found)
  - PATCH /:id (update happy)
  - DELETE /:id (happy)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.eap.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_PARTNERSHIP_ID = "00000000-0000-0000-0000-0000000000aa"
_PROVIDER_ID = "00000000-0000-0000-0000-0000000000bb"


# ─── GET / ──────────────────────────────────────────────────────


def test_list_partnerships_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
) -> None:
    """list 含 partnership + partner_org 信息 + assignment count."""
    p = make_partnership()  # type: ignore[operator]
    # 1) partnerships list; 2) partner_org name/slug; 3) active assignments []
    setup_db_results([[p], ("Provider Co", "provider-co"), []])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/eap/partnerships/")
    assert r.status_code == 200
    body = r.json()
    assert len(body["partnerships"]) == 1
    item = body["partnerships"][0]
    assert item["id"] == _PARTNERSHIP_ID
    assert item["role"] == "enterprise"  # 当前 org 是 enterprise 方
    assert item["partnerOrg"]["name"] == "Provider Co"
    assert item["assignedCounselorCount"] == 0


def test_list_partnerships_counselor_role_403(
    counselor_org_client: TestClient,
) -> None:
    """非 org_admin → 403."""
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/eap/partnerships/")
    assert r.status_code == 403


# ─── POST / ─────────────────────────────────────────────────────


def test_create_partnership_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """provider 存在 + 无重复 → 201."""
    # 1) provider 存在 (Organization.id row); 2) dup check None
    setup_db_results([(1,), None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/partnerships/",
        json={"providerOrgId": _PROVIDER_ID, "seatAllocation": 100, "notes": "test"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["partnership"]["providerOrgId"] == _PROVIDER_ID
    mock_db.commit.assert_awaited()


def test_create_partnership_provider_not_found_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """provider org 不存在 → 404."""
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/partnerships/",
        json={"providerOrgId": _PROVIDER_ID},
    )
    assert r.status_code == 404


def test_create_partnership_duplicate_400(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
) -> None:
    """已存在合作 → 400."""
    p = make_partnership()  # type: ignore[operator]
    # 1) provider exists; 2) dup_q hits
    setup_db_results([(1,), p])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/eap/partnerships/",
        json={"providerOrgId": _PROVIDER_ID},
    )
    assert r.status_code == 400


# ─── GET /:id ───────────────────────────────────────────────────


def test_get_partnership_detail_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_partnership: object,
) -> None:
    """详情 + assignments + partner_org."""
    p = make_partnership()  # type: ignore[operator]
    # 1) partnership; 2) assignments rows; 3) partner_org
    setup_db_results([p, [], ("Provider Co", "provider-co")])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/eap/partnerships/{_PARTNERSHIP_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["partnership"]["id"] == _PARTNERSHIP_ID
    assert body["assignments"] == []


def test_get_partnership_detail_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """partnership 不存在 → 404."""
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/eap/partnerships/{_PARTNERSHIP_ID}")
    assert r.status_code == 404


# ─── PATCH /:id ─────────────────────────────────────────────────


def test_update_partnership_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_partnership: object,
) -> None:
    """patch 字段 → 200."""
    p = make_partnership()  # type: ignore[operator]
    setup_db_results([p])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/eap/partnerships/{_PARTNERSHIP_ID}",
        json={"status": "suspended", "notes": "paused"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["partnership"]["status"] == "suspended"
    assert body["partnership"]["notes"] == "paused"
    mock_db.commit.assert_awaited()


# ─── DELETE /:id ────────────────────────────────────────────────


def test_delete_partnership_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
    make_partnership: object,
) -> None:
    """删除 → 204."""
    p = make_partnership()  # type: ignore[operator]
    # 1) partnership lookup; 2) DELETE execute
    setup_db_results([p, None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/eap/partnerships/{_PARTNERSHIP_ID}")
    assert r.status_code == 204
    mock_db.commit.assert_awaited()


def test_delete_partnership_not_found(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/eap/partnerships/{_PARTNERSHIP_ID}")
    assert r.status_code == 404
