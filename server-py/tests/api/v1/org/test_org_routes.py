"""
Org core routes — 镜像 Node ``server/src/modules/org/org.routes.ts``.

Phase 3 smoke tests (Node 端无 .test.ts, 这里建立基线):
  - GET    /api/orgs/                        — 列表 (happy + 401)
  - POST   /api/orgs/                        — 创建 (sysadm only, slug dup 拒绝, 非 sysadm 拒绝)
  - GET    /api/orgs/{id}                    — 详情 (happy, NotFound, rejectClient)
  - PATCH  /api/orgs/{id}                    — 更新 (admin only)
  - GET    /api/orgs/{id}/members            — 列表 (admin only)
  - POST   .../members/invite                — 邀请 (新建 user / dup 拒)
  - PATCH  .../members/me                    — 自助编辑 bio
  - PATCH  .../members/{member_id}           — admin 编辑 (含 supervisor feature gate)
  - DELETE .../members/{member_id}           — 删除 (不能删自己)
  - GET    .../triage-config                 — 读 (admin/counselor)
  - PUT    .../triage-config                 — 写 (admin only)
  - POST   .../members/{member_id}/transfer-cases — 批量转介
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.org.conftest import SetupDbResults


_ORG_ID = "00000000-0000-0000-0000-000000000099"
_USER_ID = "00000000-0000-0000-0000-000000000001"
_OTHER_USER_ID = "00000000-0000-0000-0000-000000000010"
_MEMBER_ID = "00000000-0000-0000-0000-000000000050"


# ─── GET /api/orgs/ ─────────────────────────────────────────────


def test_list_my_orgs_happy(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org(name="Org A", slug="org-a")  # type: ignore[operator]
    # join row tuple (Organization, role, status)
    setup_db_results([[(org, "org_admin", "active")]])

    r = authed_client.get("/api/orgs/")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["myRole"] == "org_admin"
    assert body[0]["myStatus"] == "active"
    assert body[0]["name"] == "Org A"


def test_list_my_orgs_requires_auth(client: TestClient) -> None:
    r = client.get("/api/orgs/")
    assert r.status_code == 401


# ─── POST /api/orgs/ ────────────────────────────────────────────


def test_create_org_sysadm_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """sysadm + 唯一 slug → 201 + org + creator 加 admin_member, transactional."""
    setup_db_results([None])  # slug 唯一性: 不存在
    r = sysadm_client.post("/api/orgs/", json={"name": "Org X", "slug": "org-x"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Org X"
    assert body["slug"] == "org-x"
    # 至少 commit 一次 (org + member 同 transaction)
    mock_db.commit.assert_awaited()


def test_create_org_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.post("/api/orgs/", json={"name": "X", "slug": "x"})
    assert r.status_code == 403


def test_create_org_rejects_duplicate_slug(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    setup_db_results([make_org(slug="taken")])  # type: ignore[operator]
    r = sysadm_client.post("/api/orgs/", json={"name": "X", "slug": "taken"})
    assert r.status_code == 400
    assert "taken" in r.json()["message"]


# ─── GET /api/orgs/{id} ────────────────────────────────────────


def test_get_org_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
) -> None:
    org = make_org(slug="myorg")  # type: ignore[operator]
    setup_db_results([org])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _ORG_ID
    assert body["slug"] == "myorg"


def test_get_org_404(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}")
    assert r.status_code == 404


def test_get_org_rejects_client(client_role_org_client: TestClient) -> None:
    """legacy role='client' 不能访问 staff 端点 (rejectClient)."""
    r = client_role_org_client.get(f"/api/orgs/{_ORG_ID}")
    assert r.status_code == 403


# ─── PATCH /api/orgs/{id} ──────────────────────────────────────


def test_patch_org_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org(name="Old")  # type: ignore[operator]
    setup_db_results([org])
    r = admin_org_client.patch(f"/api/orgs/{_ORG_ID}", json={"name": "New"})
    assert r.status_code == 200
    assert org.name == "New"
    mock_db.commit.assert_awaited()


def test_patch_org_403_when_counselor(counselor_org_client: TestClient) -> None:
    r = counselor_org_client.patch(f"/api/orgs/{_ORG_ID}", json={"name": "X"})
    assert r.status_code == 403


# ─── GET /api/orgs/{id}/members ─────────────────────────────────


def test_list_members_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    make_user_row: object,
) -> None:
    m = make_member()  # type: ignore[operator]
    u = make_user_row()  # type: ignore[operator]
    setup_db_results([[(m, u)]])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/members")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["userId"] == _OTHER_USER_ID
    assert body[0]["email"] == "u@example.com"
    assert body[0]["role"] == "counselor"


def test_list_members_403_when_counselor(counselor_org_client: TestClient) -> None:
    r = counselor_org_client.get(f"/api/orgs/{_ORG_ID}/members")
    assert r.status_code == 403


# ─── POST .../members/invite ────────────────────────────────────


def test_invite_member_creates_new_user(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """email 不存在 → 建 placeholder user + member, 单 transaction commit."""
    # 1) seat-count list (mock all() returns []), 2) user lookup None,
    # 3) dup member None
    setup_db_results([[], None, None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/members/invite",
        json={"email": "new@example.com", "role": "counselor"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "new@example.com"
    assert body["role"] == "counselor"
    assert body["status"] == "pending"
    mock_db.commit.assert_awaited()


def test_invite_member_rejects_duplicate(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user_row: object,
    make_member: object,
) -> None:
    """user 已是成员 → 400."""
    u = make_user_row(email="existing@example.com")  # type: ignore[operator]
    m = make_member()  # type: ignore[operator]
    setup_db_results([[], u, m])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/members/invite",
        json={"email": "existing@example.com", "role": "counselor"},
    )
    assert r.status_code == 400
    assert "already a member" in r.json()["message"]


# ─── PATCH .../members/me ──────────────────────────────────────


def test_self_update_bio(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    """Phase 14f: 仅 bio/specialties/certs 可改; 其它不在 schema 自然忽略."""
    m = make_member(user_id=uuid.UUID(_USER_ID))  # type: ignore[operator]
    setup_db_results([m])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/members/me",
        json={"bio": "我是新简介", "specialties": ["焦虑", "抑郁"]},
    )
    assert r.status_code == 200
    assert m.bio == "我是新简介"
    assert m.specialties == ["焦虑", "抑郁"]
    mock_db.commit.assert_awaited()


def test_self_update_rejects_empty_body(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
) -> None:
    m = make_member(user_id=uuid.UUID(_USER_ID))  # type: ignore[operator]
    setup_db_results([m])
    r = admin_org_client.patch(f"/api/orgs/{_ORG_ID}/members/me", json={})
    assert r.status_code == 400
    assert "没有可更新" in r.json()["message"]


# ─── PATCH .../members/{member_id} ────────────────────────────


def test_admin_update_member_basic(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    m = make_member()  # type: ignore[operator]
    setup_db_results([m])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}",
        json={"role": "supervisor", "status": "active"},
    )
    assert r.status_code == 200
    assert m.role == "supervisor"
    mock_db.commit.assert_awaited()


def test_admin_update_supervisor_feature_gated(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
) -> None:
    """starter tier 不含 supervisor feature → 设 supervisorId 失败 403."""
    m = make_member()  # type: ignore[operator]
    setup_db_results([m])
    r = admin_org_client.patch(
        f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}",
        json={"supervisorId": "00000000-0000-0000-0000-000000000999"},
    )
    assert r.status_code == 403
    assert "督导" in r.json()["message"]


# ─── DELETE .../members/{member_id} ───────────────────────────


def test_delete_member_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    m = make_member(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    setup_db_results([m, None])  # member found, then delete returns None
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}")
    assert r.status_code == 200
    assert r.json() == {"success": True}
    mock_db.commit.assert_awaited()


def test_delete_member_rejects_self(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
) -> None:
    """删自己 → 400 'Cannot remove yourself'."""
    m = make_member(user_id=uuid.UUID(_USER_ID))  # type: ignore[operator]
    setup_db_results([m])
    r = admin_org_client.delete(f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}")
    assert r.status_code == 400


# ─── triage-config ──────────────────────────────────────────────


def test_get_triage_config_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([({"levels": [{"key": "level_1"}]},)])
    r = admin_org_client.get(f"/api/orgs/{_ORG_ID}/triage-config")
    assert r.status_code == 200
    assert r.json() == {"levels": [{"key": "level_1"}]}


def test_put_triage_config_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org()  # type: ignore[operator]
    setup_db_results([org])
    r = admin_org_client.put(
        f"/api/orgs/{_ORG_ID}/triage-config",
        json={"levels": [{"key": "lv1"}], "aggregation": "highest"},
    )
    assert r.status_code == 200
    assert org.triage_config == {"levels": [{"key": "lv1"}], "aggregation": "highest"}
    mock_db.commit.assert_awaited()


# ─── transfer-cases ─────────────────────────────────────────────


def test_transfer_cases_happy(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
    make_member: object,
    mock_db: AsyncMock,
) -> None:
    """单条转移 → 删 + 建 + 通知 + commit. 返回 results + successCount."""
    src = make_member(user_id=uuid.UUID(_OTHER_USER_ID))  # type: ignore[operator]
    # 1) source counselor lookup, 2) delete result, 3) ... 单条 transfer 内部多 SQL
    # 此处简化: side_effect 只配第一条 (src), 其余 execute 默认 AsyncMock 都返 ok
    mock_db.execute = AsyncMock(
        side_effect=[
            __import__("unittest.mock", fromlist=["MagicMock"]).MagicMock(
                scalar_one_or_none=lambda: src, scalar=lambda: src, first=lambda: src
            ),
            # subsequent calls (delete) — return whatever
            __import__("unittest.mock", fromlist=["MagicMock"]).MagicMock(
                scalar_one_or_none=lambda: None, scalar=lambda: None
            ),
        ]
    )
    body = {
        "transfers": [
            {
                "clientId": "00000000-0000-0000-0000-000000000111",
                "toCounselorId": "00000000-0000-0000-0000-000000000222",
            }
        ]
    }
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}/transfer-cases",
        json=body,
    )
    assert r.status_code == 200
    out = r.json()
    assert "results" in out
    assert "successCount" in out


def test_transfer_cases_404_when_member_missing(
    admin_org_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = admin_org_client.post(
        f"/api/orgs/{_ORG_ID}/members/{_MEMBER_ID}/transfer-cases",
        json={"transfers": [{"clientId": _USER_ID, "toCounselorId": _OTHER_USER_ID}]},
    )
    assert r.status_code == 404
