"""
Admin tenant routes — 镜像 ``admin-tenant.routes.ts``.

Phase 3 Tier 4 smoke tests:
  - GET    /api/admin/tenants/                          — 列表 + EAP partnership
  - GET    /api/admin/tenants/{id}                      — 详情 + members + license
  - POST   /api/admin/tenants/                          — 向导 (org + license + admin)
  - PATCH  /api/admin/tenants/{id}                      — 更新 name/slug/orgType
  - DELETE /api/admin/tenants/{id}                      — 软删
  - POST   /api/admin/tenants/{id}/members              — 加成员 (3 策略)
  - PATCH  /api/admin/tenants/{id}/members/{m_id}       — 改成员 (clinical_practitioner)
  - DELETE /api/admin/tenants/{id}/members/{m_id}       — 移除
  - GET    /api/admin/tenants/{id}/services             — 读 services (mask 敏感)
  - PATCH  /api/admin/tenants/{id}/services             — 写 services
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.admin.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_MEMBER_ID = "00000000-0000-0000-0000-000000000050"


# ─── List Tenants ──────────────────────────────────────────────────


def test_list_tenants_requires_auth(client: TestClient) -> None:
    r = client.get("/api/admin/tenants/")
    assert r.status_code == 401


def test_list_tenants_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/tenants/")
    assert r.status_code == 403


def test_list_tenants_empty(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """orgs_q + partnerships 都空 → []."""
    setup_db_results([[], []])
    r = sysadm_client.get("/api/admin/tenants/")
    assert r.status_code == 200
    assert r.json() == []


def test_list_tenants_enterprise(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """orgType=enterprise → isEnterprise=True + partnership_count 来自 part_map."""
    org_uuid = uuid.UUID(_ORG_ID)
    org_row = type(
        "R",
        (),
        {
            "id": org_uuid,
            "name": "Enterprise X",
            "slug": "enterprise-x",
            "plan": "enterprise",
            "license_key": None,
            "settings": {"orgType": "enterprise"},
            "created_at": None,
            "member_count": 50,
        },
    )()
    part_row = type("PR", (), {"enterprise_org_id": org_uuid, "cnt": 3})()
    setup_db_results([[org_row], [part_row]])
    r = sysadm_client.get("/api/admin/tenants/")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["isEnterprise"] is True
    assert body[0]["partnershipCount"] == 3


# ─── Tenant Detail ─────────────────────────────────────────────────


def test_tenant_detail_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.get(f"/api/admin/tenants/{_ORG_ID}")
    assert r.status_code == 404


def test_tenant_detail_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    make_user: object,
    make_member: object,
) -> None:
    org = make_org()  # type: ignore[operator]
    u = make_user()  # type: ignore[operator]
    m = make_member()  # type: ignore[operator]
    setup_db_results([org, [(m, u)]])
    r = sysadm_client.get(f"/api/admin/tenants/{_ORG_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _ORG_ID
    assert len(body["members"]) == 1
    assert body["license"]["status"] == "none"


# ─── Create Tenant ─────────────────────────────────────────────────


def test_create_tenant_invalid_slug(sysadm_client: TestClient) -> None:
    r = sysadm_client.post(
        "/api/admin/tenants/",
        json={
            "org": {"name": "X", "slug": "Has Spaces"},
            "subscription": {"tier": "starter", "maxSeats": 5, "months": 12},
            "admin": {"email": "a@b.com", "name": "A", "password": "secret123"},
        },
    )
    assert r.status_code == 400


def test_create_tenant_dup_slug(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    """slug 已存在 → 400."""
    setup_db_results([uuid.UUID(_ORG_ID)])  # exists_q.scalar_one_or_none returns existing id
    r = sysadm_client.post(
        "/api/admin/tenants/",
        json={
            "org": {"name": "X", "slug": "taken"},
            "subscription": {"tier": "starter", "maxSeats": 5, "months": 12},
            "admin": {"email": "a@b.com", "name": "A", "password": "secret123"},
        },
    )
    assert r.status_code == 400


def test_create_tenant_invalid_tier(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """tier 校验在 slug uniqueness 之后跑 — 先放过 unique check, 然后 tier 应 fail."""
    setup_db_results([None])  # slug 唯一性: 不存在
    r = sysadm_client.post(
        "/api/admin/tenants/",
        json={
            "org": {"name": "X", "slug": "valid-x"},
            "subscription": {"tier": "platinum", "maxSeats": 5, "months": 12},
            "admin": {"email": "a@b.com", "name": "A", "password": "secret123"},
        },
    )
    assert r.status_code == 400


def test_create_tenant_happy_new_admin(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """新建 org + 新建 admin user (邮箱不存在)."""
    # 1. slug 唯一性: None
    # 2. (没 user_id 走 email 分支, email 查存在: None → 新建)
    setup_db_results([None, None])
    r = sysadm_client.post(
        "/api/admin/tenants/",
        json={
            "org": {"name": "Org Y", "slug": "org-y"},
            "subscription": {"tier": "starter", "maxSeats": 10, "months": 12},
            "admin": {"email": "admin@orgy.com", "name": "Admin", "password": "secret123"},
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert "orgId" in body
    mock_db.commit.assert_awaited()


# ─── Add Member ────────────────────────────────────────────────────


def test_add_member_org_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.post(
        f"/api/admin/tenants/{_ORG_ID}/members",
        json={"email": "x@e.com", "name": "X", "password": "secret123"},
    )
    assert r.status_code == 404


def test_add_member_dup(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user: object,
    make_member: object,
) -> None:
    """已有同 user_id member → 400."""
    # 1. org exists check
    # 2. user lookup by email → existing
    # 3. dup check → existing member
    org_id_uuid = uuid.UUID(_ORG_ID)
    user = make_user()  # type: ignore[operator]
    existing_member = make_member()  # type: ignore[operator]
    setup_db_results([org_id_uuid, user, existing_member])
    r = sysadm_client.post(
        f"/api/admin/tenants/{_ORG_ID}/members",
        json={"email": "u@example.com", "name": "U"},
    )
    assert r.status_code == 400
    assert "已是本机构成员" in r.json()["message"]


def test_add_member_new_user(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """新邮箱 → 新建 user + 加 member."""
    org_id_uuid = uuid.UUID(_ORG_ID)
    # 1. org exists; 2. user by email: None → create new; 3. dup check: None
    setup_db_results([org_id_uuid, None, None])
    r = sysadm_client.post(
        f"/api/admin/tenants/{_ORG_ID}/members",
        json={
            "email": "new@e.com",
            "name": "New",
            "password": "secret123",
            "role": "counselor",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "counselor"
    assert body["reusedExistingUser"] is False
    mock_db.commit.assert_awaited()


# ─── Patch Member ──────────────────────────────────────────────────


def test_patch_member_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}/members/{_MEMBER_ID}",
        json={"role": "client"},
    )
    assert r.status_code == 404


def test_patch_member_clinical_practitioner_on(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    """clinicalPractitioner=True → access_profile.dataClasses 含 phi_full."""
    m = make_member(access_profile={})  # type: ignore[operator]
    setup_db_results([m])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}/members/{_MEMBER_ID}",
        json={"clinicalPractitioner": True},
    )
    assert r.status_code == 200
    assert "phi_full" in m.access_profile["dataClasses"]
    mock_db.commit.assert_awaited()


def test_patch_member_clinical_practitioner_off(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
) -> None:
    """clinicalPractitioner=False → 移除 dataClasses."""
    m = make_member(  # type: ignore[operator]
        access_profile={
            "dataClasses": ["phi_full"],
            "reason": "previous",
            "grantedAt": "2024-01-01",
        }
    )
    setup_db_results([m])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}/members/{_MEMBER_ID}",
        json={"clinicalPractitioner": False},
    )
    assert r.status_code == 200
    assert "dataClasses" not in m.access_profile


# ─── Remove Member ─────────────────────────────────────────────────


def test_remove_member_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.delete(
        f"/api/admin/tenants/{_ORG_ID}/members/{_MEMBER_ID}",
    )
    assert r.status_code == 404


def test_remove_member_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    m = make_member()  # type: ignore[operator]
    # 1. select member; 2. delete query (no row needed)
    setup_db_results([m, None])
    r = sysadm_client.delete(
        f"/api/admin/tenants/{_ORG_ID}/members/{_MEMBER_ID}",
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    mock_db.commit.assert_awaited()


# ─── Update Tenant ─────────────────────────────────────────────────


def test_update_tenant_invalid_slug(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}",
        json={"slug": "Has Spaces"},
    )
    assert r.status_code == 400


def test_update_tenant_orgtype(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    """合法 orgType → settings.orgType merge."""
    org = make_org(settings={"branding": {"theme": "blue"}})  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}",
        json={"orgType": "enterprise"},
    )
    assert r.status_code == 200
    # branding 不丢
    assert org.settings["branding"]["theme"] == "blue"
    assert org.settings["orgType"] == "enterprise"
    mock_db.commit.assert_awaited()


def test_update_tenant_invalid_orgtype(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}",
        json={"orgType": "magic"},
    )
    assert r.status_code == 400


# ─── Delete Tenant ─────────────────────────────────────────────────


def test_delete_tenant_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.delete(f"/api/admin/tenants/{_ORG_ID}")
    assert r.status_code == 404


def test_delete_tenant_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """1. org exists; 2. delete members; 3. delete org."""
    setup_db_results([uuid.UUID(_ORG_ID), None, None])
    r = sysadm_client.delete(f"/api/admin/tenants/{_ORG_ID}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    mock_db.commit.assert_awaited()


# ─── Services ──────────────────────────────────────────────────────


def test_get_services_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.get(f"/api/admin/tenants/{_ORG_ID}/services")
    assert r.status_code == 404


def test_get_services_masks_secrets(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org(  # type: ignore[operator]
        settings={
            "aiConfig": {
                "apiKey": "sk-supersecret123abcd",
                "baseUrl": "https://ai.com",
                "model": "gpt-4",
                "monthlyTokenLimit": 100000,
            },
            "emailConfig": {
                "smtpHost": "smtp.gmail.com",
                "smtpPort": 587,
                "smtpUser": "u",
                "smtpPass": "secret",
                "senderName": "Test",
                "senderEmail": "test@org.com",
            },
        }
    )
    setup_db_results([org])
    r = sysadm_client.get(f"/api/admin/tenants/{_ORG_ID}/services")
    assert r.status_code == 200
    body = r.json()
    assert body["aiConfig"]["apiKey"] == "****abcd"  # 末 4 字符
    assert body["aiConfig"]["model"] == "gpt-4"
    assert body["emailConfig"]["smtpPass"] == "****"
    assert body["emailConfig"]["smtpUser"] == "u"  # 非敏感字段不 mask


def test_patch_services_preserves_apikey_when_masked(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    """patch 传 apiKey='****xxxx' → 保留旧值, 不覆盖."""
    org = make_org(  # type: ignore[operator]
        settings={
            "aiConfig": {"apiKey": "real-secret-key", "model": "gpt-3"},
        }
    )
    setup_db_results([org])
    r = sysadm_client.patch(
        f"/api/admin/tenants/{_ORG_ID}/services",
        json={"aiConfig": {"apiKey": "****xxxx", "model": "gpt-4-turbo"}},
    )
    assert r.status_code == 200
    # apiKey 没变
    assert org.settings["aiConfig"]["apiKey"] == "real-secret-key"
    assert org.settings["aiConfig"]["model"] == "gpt-4-turbo"
    mock_db.commit.assert_awaited()
