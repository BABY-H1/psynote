"""
Admin core routes — 镜像 ``server/src/modules/admin/admin.routes.ts``.

Phase 3 Tier 4 smoke tests (Node 端无 .test.ts, 这里建立基线):

  - GET    /api/admin/stats                                  — 三表 count
  - GET    /api/admin/orgs                                   — 列表 + memberCount
  - GET    /api/admin/orgs/{id}                              — 详情 + members
  - PATCH  /api/admin/orgs/{id}                              — plan / settings 改
  - GET    /api/admin/users                                  — 列表 + ?search=
  - GET    /api/admin/users/{id}                             — 详情 + memberships
  - POST   /api/admin/users                                  — 创建 + dup 拒绝
  - PATCH  /api/admin/users/{id}                             — 改 name / isSysAdmin
  - POST   /api/admin/users/{id}/reset-password              — 重置 (短密码 422)
  - POST   /api/admin/users/{id}/toggle-status               — 启/禁全部 memberships
  - GET    /api/admin/config                                 — 6 category 默认骨架
  - PATCH  /api/admin/config                                 — 部分更新 + skip 只读

每端点 ≥2 cases (sysadm-only 守门 + happy/error path).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from tests.api.v1.admin.conftest import SetupDbResults


_USER_ID = "00000000-0000-0000-0000-000000000001"
_ORG_ID = "00000000-0000-0000-0000-000000000099"
_OTHER_USER_ID = "00000000-0000-0000-0000-000000000010"


# ─── /stats ─────────────────────────────────────────────────────────


def test_stats_requires_auth(client: TestClient) -> None:
    r = client.get("/api/admin/stats")
    assert r.status_code == 401


def test_stats_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/stats")
    assert r.status_code == 403


def test_stats_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """单 SQL 多 scalar subquery → .first() 返回 (org_count, user_count, member_count)."""
    setup_db_results([(7, 42, 100)])
    r = sysadm_client.get("/api/admin/stats")
    assert r.status_code == 200
    body = r.json()
    assert body == {"organizations": 7, "users": 42, "memberships": 100}


# ─── /orgs ──────────────────────────────────────────────────────────


def test_list_orgs_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/orgs")
    assert r.status_code == 403


def test_list_orgs_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """SQL 返 row tuple (id, name, slug, plan, created_at, member_count)."""
    org_id = uuid.UUID(_ORG_ID)
    row = type(
        "Row",
        (),
        {
            "id": org_id,
            "name": "Org A",
            "slug": "org-a",
            "plan": "free",
            "created_at": None,
            "member_count": 5,
        },
    )()
    setup_db_results([[row]])

    r = sysadm_client.get("/api/admin/orgs")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body[0]["id"] == _ORG_ID
    assert body[0]["memberCount"] == 5


def test_get_org_detail_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])  # org lookup misses
    r = sysadm_client.get(f"/api/admin/orgs/{_ORG_ID}")
    assert r.status_code == 404


def test_get_org_detail_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    make_user: object,
    make_member: object,
) -> None:
    org = make_org()  # type: ignore[operator]
    user = make_user(name="Alice", email="alice@ex.com")  # type: ignore[operator]
    member = make_member()  # type: ignore[operator]
    setup_db_results([org, [(member, user)]])

    r = sysadm_client.get(f"/api/admin/orgs/{_ORG_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _ORG_ID
    assert len(body["members"]) == 1
    assert body["members"][0]["userName"] == "Alice"


def test_patch_org_plan(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_org: object,
    mock_db: AsyncMock,
) -> None:
    org = make_org(plan="free")  # type: ignore[operator]
    setup_db_results([org])
    r = sysadm_client.patch(
        f"/api/admin/orgs/{_ORG_ID}",
        json={"plan": "pro"},
    )
    assert r.status_code == 200
    assert r.json()["plan"] == "pro"
    assert org.plan == "pro"
    mock_db.commit.assert_awaited()


def test_patch_org_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.patch(f"/api/admin/orgs/{_ORG_ID}", json={"plan": "pro"})
    assert r.status_code == 404


# ─── /users ─────────────────────────────────────────────────────────


def test_list_users_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/users")
    assert r.status_code == 403


def test_list_users_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    user_id = uuid.UUID(_USER_ID)
    row = type(
        "Row",
        (),
        {
            "id": user_id,
            "email": "u@ex.com",
            "name": "U",
            "is_system_admin": False,
            "created_at": None,
            "org_count": 2,
        },
    )()
    setup_db_results([[row]])
    r = sysadm_client.get("/api/admin/users")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["id"] == _USER_ID
    assert body[0]["orgCount"] == 2


def test_list_users_search(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([[]])
    r = sysadm_client.get("/api/admin/users?search=alice")
    assert r.status_code == 200
    assert r.json() == []


def test_get_user_detail_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.get(f"/api/admin/users/{_USER_ID}")
    assert r.status_code == 404


def test_get_user_detail_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user: object,
    make_org: object,
    make_member: object,
) -> None:
    user = make_user(user_id=uuid.UUID(_USER_ID))  # type: ignore[operator]
    org = make_org()  # type: ignore[operator]
    member = make_member()  # type: ignore[operator]
    setup_db_results([user, [(member, org)]])

    r = sysadm_client.get(f"/api/admin/users/{_USER_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == _USER_ID
    assert len(body["memberships"]) == 1
    assert body["memberships"][0]["orgName"] == "Test Org"


def test_create_user_dup_email(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user: object,
) -> None:
    """email 已存在 → 409."""
    setup_db_results([make_user(email="dup@ex.com")])  # type: ignore[operator]
    r = sysadm_client.post(
        "/api/admin/users",
        json={"email": "dup@ex.com", "name": "Dup", "password": "secret123"},
    )
    assert r.status_code == 409


def test_create_user_short_password(sysadm_client: TestClient) -> None:
    """Pydantic min_length=6 catch."""
    r = sysadm_client.post(
        "/api/admin/users",
        json={"email": "x@ex.com", "name": "X", "password": "short"},
    )
    assert r.status_code == 400


def test_create_user_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    setup_db_results([None])  # email 不存在
    r = sysadm_client.post(
        "/api/admin/users",
        json={
            "email": "new@ex.com",
            "name": "New",
            "password": "secret123",
            "isSystemAdmin": True,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "new@ex.com"
    assert body["isSystemAdmin"] is True
    mock_db.add.assert_called()
    mock_db.commit.assert_awaited()


def test_patch_user_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.patch(f"/api/admin/users/{_USER_ID}", json={"name": "Y"})
    assert r.status_code == 404


def test_patch_user_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user: object,
    mock_db: AsyncMock,
) -> None:
    u = make_user(name="Old")  # type: ignore[operator]
    setup_db_results([u])
    r = sysadm_client.patch(
        f"/api/admin/users/{_USER_ID}",
        json={"name": "NewName", "isSystemAdmin": True},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "NewName"
    assert r.json()["isSystemAdmin"] is True
    mock_db.commit.assert_awaited()


def test_reset_password_short(sysadm_client: TestClient) -> None:
    r = sysadm_client.post(
        f"/api/admin/users/{_USER_ID}/reset-password",
        json={"password": "abc"},
    )
    assert r.status_code == 400


def test_reset_password_404(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.post(
        f"/api/admin/users/{_USER_ID}/reset-password",
        json={"password": "newsecret"},
    )
    assert r.status_code == 404


def test_reset_password_happy(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    make_user: object,
    mock_db: AsyncMock,
) -> None:
    u = make_user()  # type: ignore[operator]
    old_hash = u.password_hash
    setup_db_results([u])
    r = sysadm_client.post(
        f"/api/admin/users/{_USER_ID}/reset-password",
        json={"password": "newsecret"},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert u.password_hash != old_hash  # bcrypt hash 已改
    mock_db.commit.assert_awaited()


def test_toggle_status_disable(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """禁用 → 单 UPDATE WHERE user_id, 不需要先查存在性."""
    setup_db_results([None])  # UPDATE 自身不返 row
    r = sysadm_client.post(
        f"/api/admin/users/{_USER_ID}/toggle-status",
        json={"disabled": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "disabled"
    assert body["ok"] is True
    mock_db.commit.assert_awaited()


def test_toggle_status_enable(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    setup_db_results([None])
    r = sysadm_client.post(
        f"/api/admin/users/{_USER_ID}/toggle-status",
        json={"disabled": False},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"


# ─── /config ────────────────────────────────────────────────────────


def test_get_config_returns_6_categories(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """干净 DB (无 system_config 行) → 6 类默认骨架不会丢."""
    # _load_db_config: select SystemConfig → []
    # _load_restart_required: scalar count → 0
    setup_db_results([[], 0])
    r = sysadm_client.get("/api/admin/config")
    assert r.status_code == 200
    body = r.json()
    assert "platform" in body
    assert "security" in body
    assert "defaults" in body
    assert "limits" in body
    assert "email" in body
    assert "ai" in body
    assert body["_meta"]["restartRequired"] is False


def test_get_config_rejects_non_sysadm(authed_client: TestClient) -> None:
    r = authed_client.get("/api/admin/config")
    assert r.status_code == 403


def test_patch_config_invalid_value(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """validators 校验 — minPasswordLength=2 越界 → 400."""
    # 不会进 _set_config (校验先 fail), 不需要 db result
    setup_db_results([])
    r = sysadm_client.patch(
        "/api/admin/config",
        json={"security": {"minPasswordLength": 2}},
    )
    assert r.status_code == 400
    assert "minPasswordLength" in r.json()["message"]


def test_patch_config_skip_readonly(
    sysadm_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """patch email/ai 应被 skip (只读), commit + 重读 config."""
    # 第 1 个: load db config (空); 第 2 个: load restart_required
    setup_db_results([[], 0])
    r = sysadm_client.patch(
        "/api/admin/config",
        json={"email": {"host": "should-be-ignored"}},
    )
    assert r.status_code == 200
    body = r.json()
    # email/ai 仍是默认骨架; 没有真写入 system_config 表
    assert "_meta" in body
