"""
User routes — 镜像 ``server/src/modules/user/user.routes.ts`` 行为 (Node 端
没有同名 .test.ts, 这里写 smoke 级别覆盖)。

覆盖:
  - GET /me        user 缺失 → 400; 正常 → 200 + camelCase + member 形态
  - GET /me        无 active member → ``member: null``
  - GET /me        未认证 → 401 (走 auth middleware)
  - PATCH /me      空 body → 400 "没有可更新的字段"
  - PATCH /me      name="" / 全空白 → 400 "姓名不能为空"
  - PATCH /me      合法 name + avatarUrl → 200 + commit + 返回 camelCase
  - PATCH /me      avatarUrl="" → 写 NULL (Node body.avatarUrl || null)
  - PATCH /me      未认证 → 401

测试不连真 DB — mock AsyncSession + dependency override (见 conftest.py)。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from app.db.models.org_members import OrgMember
    from app.db.models.users import User
    from tests.api.v1.user.conftest import SetupDbResults


# ─── helper: 构造 User / OrgMember stub ─────────────────────────


def _make_user(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "User One",
    avatar_url: str | None = None,
    is_system_admin: bool = False,
    is_guardian_account: bool = False,
) -> User:
    """构造 ``User`` 实例 (不持久化), 用于 mock_db.execute 返回。"""
    from app.db.models.users import User

    u = User()
    u.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000001")
    u.email = email
    u.name = name
    u.password_hash = None
    u.avatar_url = avatar_url
    u.is_system_admin = is_system_admin
    u.is_guardian_account = is_guardian_account
    # CreatedAtOnlyMixin 在真 DB 用 server_default; 测试 mock 显式赋 datetime
    u.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    return u


def _make_member_row(
    *,
    role: str = "counselor",
    bio: str | None = "Bio here",
    org_name: str | None = "Test Org",
) -> tuple[OrgMember, str | None]:
    """构造 (OrgMember, org_name) 元组 — 与 router 里 select(OrgMember, Organization.name) 形态一致。"""
    from app.db.models.org_members import OrgMember

    m = OrgMember()
    m.id = uuid.UUID("00000000-0000-0000-0000-000000000020")
    m.org_id = uuid.UUID("00000000-0000-0000-0000-000000000030")
    m.user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    m.role = role
    m.role_v2 = None
    m.principal_class = None
    m.access_profile = None
    m.permissions = {}
    m.status = "active"
    m.valid_until = None
    m.supervisor_id = None
    m.full_practice_access = False
    m.source_partnership_id = None
    m.certifications = [{"name": "Cert A"}]
    m.specialties = ["焦虑", "抑郁"]
    m.max_caseload = 20
    m.bio = bio
    m.created_at = datetime(2026, 2, 1, tzinfo=UTC)
    return (m, org_name)


# ─── GET /me ────────────────────────────────────────────────────


def test_get_me_unauthenticated_returns_401(client: TestClient) -> None:
    """未带 Bearer token → 401 (走 ``get_current_user``)。"""
    response = client.get("/api/users/me")
    assert response.status_code == 401


def test_get_me_returns_user_and_active_member(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """正常路径: user + 1 条 active member → 200 + camelCase + member.orgName。"""
    user = _make_user()
    member_row = _make_member_row()
    setup_db_results([user, member_row])

    response = authed_client.get("/api/users/me")
    assert response.status_code == 200
    body = response.json()

    # camelCase wire format (alias_generator=to_camel)
    assert body["user"]["id"] == str(user.id)
    assert body["user"]["email"] == "u@example.com"
    assert body["user"]["name"] == "User One"
    assert body["user"]["isSystemAdmin"] is False
    assert body["user"]["isGuardianAccount"] is False
    # snake_case 必须不在 wire (防 alias 双写)
    assert "is_system_admin" not in body["user"]
    assert "avatar_url" not in body["user"]

    assert body["member"] is not None
    assert body["member"]["orgName"] == "Test Org"
    assert body["member"]["role"] == "counselor"
    assert body["member"]["specialties"] == ["焦虑", "抑郁"]
    assert body["member"]["maxCaseload"] == 20


def test_get_me_with_no_active_member_returns_null_member(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """user 存在但没有 active org_member → ``member: null`` (legacy / 邀请未接受)。"""
    user = _make_user()
    setup_db_results([user, None])

    response = authed_client.get("/api/users/me")
    assert response.status_code == 200
    assert response.json()["member"] is None


def test_get_me_missing_user_returns_400(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """auth 通过但 DB 查不到 user (异常状态) → 400 "用户不存在"。"""
    setup_db_results([None])

    response = authed_client.get("/api/users/me")
    assert response.status_code == 400
    assert "用户不存在" in response.json()["message"]


# ─── PATCH /me ──────────────────────────────────────────────────


def test_patch_me_unauthenticated_returns_401(client: TestClient) -> None:
    """未带 Bearer token → 401。"""
    response = client.patch("/api/users/me", json={"name": "X"})
    assert response.status_code == 401


def test_patch_me_empty_body_returns_400(authed_client: TestClient) -> None:
    """空 body → 400 "没有可更新的字段" (镜像 Node user.routes.ts:88-90)。"""
    response = authed_client.patch("/api/users/me", json={})
    assert response.status_code == 400
    assert "没有可更新的字段" in response.json()["message"]


def test_patch_me_blank_name_returns_400(authed_client: TestClient) -> None:
    """name 全空白 → 400 "姓名不能为空" (镜像 user.routes.ts:80-82)。"""
    response = authed_client.patch("/api/users/me", json={"name": "   "})
    assert response.status_code == 400
    assert "姓名不能为空" in response.json()["message"]


def test_patch_me_updates_name_and_avatar(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """合法 name + avatarUrl → 200 + commit, 返回 camelCase user 摘要。"""
    user = _make_user(name="Old", avatar_url=None)
    setup_db_results([user])

    response = authed_client.patch(
        "/api/users/me",
        json={"name": "  New Name  ", "avatarUrl": "https://cdn/x.png"},
    )
    assert response.status_code == 200
    body = response.json()

    # ORM 实例已 mutate (mock_db.commit 不实际持久化, 但 setattr 已生效)
    assert user.name == "New Name"  # trim 生效
    assert user.avatar_url == "https://cdn/x.png"
    mock_db.commit.assert_awaited()

    # camelCase wire
    assert body["name"] == "New Name"
    assert body["avatarUrl"] == "https://cdn/x.png"
    assert "avatar_url" not in body
    assert body["isSystemAdmin"] is False


def test_patch_me_clears_avatar_url_when_empty_string(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """avatarUrl="" → 视作清空, 写 NULL (镜像 Node ``body.avatarUrl || null``)。"""
    user = _make_user(avatar_url="https://old/x.png")
    setup_db_results([user])

    response = authed_client.patch(
        "/api/users/me",
        json={"avatarUrl": ""},
    )
    assert response.status_code == 200
    assert user.avatar_url is None
    assert response.json()["avatarUrl"] is None
