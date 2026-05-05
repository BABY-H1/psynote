"""
Auth routes — 镜像 ``server/src/modules/auth/auth.routes.test.ts``。

覆盖:
  - POST /register     410 Gone (alpha 起注册必走 OrgType 专属入口)
  - POST /login        ``passwordHash`` IS NULL / "" fail-closed (W0.x); 防枚举
                       (未知邮箱与错误密码同 message); 合法 bcrypt match → tokens
  - POST /refresh      type='refresh' 标记校验; 无效 token → 400
  - POST /logout       JWT stateless, 客户端丢 token; server 200 OK
  - POST /change-password   已认证, legacy (passwordHash IS NULL) 可省 currentPassword
                            否则 currentPassword 必填 + verify; newPassword Pydantic
                            min_length=6

测试不连真 DB — mock AsyncSession + dependency override (见 conftest.py)。bcrypt /
JWT 走真实库 (Phase 1.1 已 cross-compat 验证), 让回归能 catch。
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import bcrypt
import pytest
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from app.db.models.users import User
    from tests.api.v1.auth.conftest import SetupDbResults


# ─── 测试 helper: 构造一个无副作用的 User 实例 ─────────────────


def _make_user(
    *,
    email: str = "real@example.com",
    name: str = "Real",
    password_hash: str | None = None,
    is_system_admin: bool = False,
    user_id: uuid.UUID | None = None,
) -> User:
    """构造 ``User`` 实例 (不持久化), 用于 mock_db.execute 返回。"""
    from app.db.models.users import User

    user = User()
    user.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    user.email = email
    user.name = name
    user.password_hash = password_hash
    user.is_system_admin = is_system_admin
    return user


# ─── POST /register ─────────────────────────────────────────────


def test_register_returns_410_gone(client: TestClient) -> None:
    """register 已弃用, 必须 410 + error code 引导走 OrgType 专属注册。"""
    response = client.post("/api/auth/register", json={"email": "x@y.com", "password": "anything"})
    assert response.status_code == 410
    body = response.json()
    assert body["error"] == "registration_endpoint_deprecated"


# ─── POST /login ─────────────────────────────────────────────────


def test_login_rejects_null_password_hash_fail_closed(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """auth.routes.test.ts:60-83 镜像 — W0.x: passwordHash IS NULL 必须 fail-closed,
    不能用任意密码"绕过"。"""
    legacy_user = _make_user(
        email="legacy@example.com",
        name="Legacy",
        password_hash=None,  # 关键: legacy row, NULL hash
    )
    setup_db_results([legacy_user])

    response = client.post(
        "/api/auth/login",
        json={"email": "legacy@example.com", "password": "literally-anything"},
    )
    assert response.status_code == 400
    body = response.json()
    # 防枚举: message 必须与"密码错误"一致, 不能暗示账号有特殊状态
    assert "账号或密码错误" in body["message"]


def test_login_rejects_empty_password_hash(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """auth.routes.test.ts:86-102 镜像 — passwordHash="" 同样视作未设密码, fail-closed。"""
    empty_user = _make_user(
        email="empty@example.com",
        name="Empty",
        password_hash="",  # 空字符串 = 未设密码 = 必须 fail-closed
    )
    setup_db_results([empty_user])

    response = client.post(
        "/api/auth/login",
        json={"email": "empty@example.com", "password": "whatever"},
    )
    assert response.status_code == 400


def test_login_accepts_valid_bcrypt_password(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """auth.routes.test.ts:104-125 镜像 — 正确 bcrypt match → 200 + tokens + user 摘要。

    bcrypt 走真实库, 验真实 hash 兼容 (与 Node bcryptjs 1:1 兼容已在 Phase 1.1 测过)。
    """
    plain_password = "correct-horse"
    real_hash = bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt(10)).decode()
    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000003")
    real_user = _make_user(
        email="real@example.com",
        name="Real",
        password_hash=real_hash,
        is_system_admin=False,
        user_id=user_uuid,
    )
    setup_db_results([real_user])

    response = client.post(
        "/api/auth/login",
        json={"email": "real@example.com", "password": plain_password},
    )
    assert response.status_code == 200
    body = response.json()
    # camelCase wire format (alias_generator=to_camel)
    assert body["accessToken"]
    assert body["refreshToken"]
    assert body["user"]["id"] == str(user_uuid)
    assert body["user"]["email"] == "real@example.com"
    assert body["user"]["name"] == "Real"
    assert body["user"]["isSystemAdmin"] is False
    # last_login_at update + commit
    mock_db.commit.assert_awaited()


def test_login_rejects_wrong_password(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """auth.routes.test.ts:127-144 镜像 — bcrypt mismatch → 400, 与 NULL hash / 未知邮箱
    同 message (防枚举)。"""
    real_hash = bcrypt.hashpw(b"correct-horse", bcrypt.gensalt(10)).decode()
    real_user = _make_user(
        email="real2@example.com",
        password_hash=real_hash,
    )
    setup_db_results([real_user])

    response = client.post(
        "/api/auth/login",
        json={"email": "real2@example.com", "password": "wrong"},
    )
    assert response.status_code == 400
    assert "账号或密码错误" in response.json()["message"]


def test_login_rejects_unknown_email_with_same_shape(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """auth.routes.test.ts:146-163 镜像 — 未知邮箱必须与"错密码"完全同 shape。

    若 message / status / 响应时延任一不同, 攻击者就能 enumeration 探测哪些邮箱已注册。
    """
    setup_db_results([None])  # DB 查无此 user

    response = client.post(
        "/api/auth/login",
        json={"email": "ghost@example.com", "password": "x"},
    )
    assert response.status_code == 400
    assert "账号或密码错误" in response.json()["message"]


# ─── POST /refresh ───────────────────────────────────────────────


def test_refresh_with_valid_refresh_token_returns_new_tokens(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """合法 refresh token (含 type='refresh') → 200 + 新 accessToken + 新 refreshToken。"""
    from app.core.security import create_refresh_token

    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000007")
    user = _make_user(email="refresh@example.com", user_id=user_uuid)
    setup_db_results([user])

    refresh_token = create_refresh_token(user_id=str(user_uuid))
    response = client.post("/api/auth/refresh", json={"refreshToken": refresh_token})

    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"]
    assert body["refreshToken"]
    # /refresh 响应不含 user (只 TokensResponse, 不是 LoginResponse)
    assert "user" not in body


def test_refresh_with_invalid_token_returns_400(client: TestClient) -> None:
    """格式损坏的 token → decode_token 抛, 路由翻成 ValidationError → 400。"""
    response = client.post("/api/auth/refresh", json={"refreshToken": "not-a-jwt"})
    assert response.status_code == 400


def test_refresh_with_access_token_returns_400(client: TestClient) -> None:
    """access token (无 type='refresh' 标记) 不能当 refresh 用 — 与 Node
    auth.routes.ts:115 行为一致。"""
    from app.core.security import create_access_token

    access_token = create_access_token(
        user_id="00000000-0000-0000-0000-000000000009",
        email="x@y.com",
        is_system_admin=False,
    )
    response = client.post("/api/auth/refresh", json={"refreshToken": access_token})
    assert response.status_code == 400


# ─── POST /logout ────────────────────────────────────────────────


def test_logout_returns_ok(client: TestClient) -> None:
    """JWT stateless, 客户端丢 token = logout, server 直接 200 {ok: true}。"""
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


# ─── POST /change-password ───────────────────────────────────────


def test_change_password_with_correct_current_succeeds(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """已认证 + 正确 currentPassword + new ≥6 → 200 + DB password_hash 改写 + commit。"""
    from app.core.security import hash_password

    old_hash = hash_password("old-password-123")
    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    db_user = _make_user(
        email="authed@example.com",
        password_hash=old_hash,
        user_id=user_uuid,
    )
    setup_db_results([db_user])

    response = authed_client.post(
        "/api/auth/change-password",
        json={
            "currentPassword": "old-password-123",
            "newPassword": "new-password-456",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # password_hash 改了 (虽然没 commit 到真 DB, ORM 对象上已更新)
    assert db_user.password_hash != old_hash
    mock_db.commit.assert_awaited()


def test_change_password_legacy_account_skips_current_password(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """legacy 账号 (password_hash IS NULL): 省 currentPassword → 200。

    Node auth.routes.ts:175 行为: 若 db_user.passwordHash 为空, 跳过 current 校验。
    """
    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    legacy_user = _make_user(
        email="authed@example.com",
        password_hash=None,  # legacy
        user_id=user_uuid,
    )
    setup_db_results([legacy_user])

    response = authed_client.post(
        "/api/auth/change-password",
        json={"newPassword": "first-real-password"},
    )
    assert response.status_code == 200
    # 改完一定写了 password_hash
    assert legacy_user.password_hash is not None
    mock_db.commit.assert_awaited()


def test_change_password_rejects_wrong_current(
    authed_client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """错误 currentPassword → 400 "当前密码不正确"。"""
    from app.core.security import hash_password

    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    db_user = _make_user(
        email="authed@example.com",
        password_hash=hash_password("real-old-password"),
        user_id=user_uuid,
    )
    setup_db_results([db_user])

    response = authed_client.post(
        "/api/auth/change-password",
        json={
            "currentPassword": "wrong-guess",
            "newPassword": "any-new-password",
        },
    )
    assert response.status_code == 400
    assert "当前密码不正确" in response.json()["message"]


def test_change_password_rejects_short_new_password(authed_client: TestClient) -> None:
    """newPassword < 6 字符 → Pydantic min_length 校验, 400 (不到 router 体)。"""
    response = authed_client.post(
        "/api/auth/change-password",
        json={
            "currentPassword": "anything",
            "newPassword": "12345",  # 5 chars, < 6
        },
    )
    assert response.status_code == 400


# ─── 额外健康性检查: schema 序列化形态 (camelCase wire) ──────


def test_login_response_uses_camel_case_keys(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """response 必须 camelCase (Node Web/portal 旧合约依赖)。

    防 schema_config.serialize_by_alias=False 回滚导致 wire 出现 snake_case key。
    """
    pwd_hash = bcrypt.hashpw(b"pw-12345", bcrypt.gensalt(10)).decode()
    user = _make_user(email="snake@example.com", password_hash=pwd_hash)
    setup_db_results([user])

    response = client.post(
        "/api/auth/login",
        json={"email": "snake@example.com", "password": "pw-12345"},
    )
    body = response.json()
    # camelCase keys 必须存在
    assert "accessToken" in body
    assert "refreshToken" in body
    assert "isSystemAdmin" in body["user"]
    # snake_case keys 必须不在 (防 alias 双写)
    assert "access_token" not in body
    assert "refresh_token" not in body
    assert "is_system_admin" not in body["user"]


# ─── Phase 5: 手机号登录 ───────────────────────────────────────


def test_login_with_phone_succeeds(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """Phase 5: 手机号 + 密码 → 200 + tokens (不再依赖 email)."""
    plain_password = "phone-pass-123"
    real_hash = bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt(10)).decode()
    user_uuid = uuid.UUID("00000000-0000-0000-0000-00000000aaaa")
    phone_user = _make_user(
        email=None,  # 关键: 用户没邮箱, 只有手机号
        name="手机用户",
        password_hash=real_hash,
        is_system_admin=False,
        user_id=user_uuid,
    )
    phone_user.phone = "13800001234"
    setup_db_results([phone_user])

    response = client.post(
        "/api/auth/login",
        json={"phone": "13800001234", "password": plain_password},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"]
    assert body["refreshToken"]
    assert body["user"]["id"] == str(user_uuid)
    mock_db.commit.assert_awaited()


def test_login_phone_invalid_format_400(client: TestClient) -> None:
    """Phase 5: 手机号格式不符合中国大陆规则 → Pydantic 拦, 400/422."""
    # 第一位不是 1
    r = client.post("/api/auth/login", json={"phone": "23800001234", "password": "x"})
    assert r.status_code in (400, 422)


def test_login_phone_too_short_400(client: TestClient) -> None:
    """10 位 → 不合法."""
    r = client.post("/api/auth/login", json={"phone": "1380000123", "password": "x"})
    assert r.status_code in (400, 422)


def test_login_neither_phone_nor_email_400(client: TestClient) -> None:
    """Phase 5: phone 和 email 都不传 → 422 (Pydantic model_validator 抛)."""
    r = client.post("/api/auth/login", json={"password": "x"})
    # FastAPI Pydantic ValidationError 默认 422
    assert r.status_code in (400, 422)


def test_login_with_phone_wrong_password_same_message(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Phase 5: 手机号存在但密码错 → 与未知账号同 message (防枚举)."""
    real_hash = bcrypt.hashpw(b"correct", bcrypt.gensalt(10)).decode()
    phone_user = _make_user(password_hash=real_hash)
    phone_user.phone = "13900009999"
    setup_db_results([phone_user])

    r = client.post(
        "/api/auth/login",
        json={"phone": "13900009999", "password": "wrong"},
    )
    assert r.status_code == 400
    assert "账号或密码错误" in r.json()["message"]


def test_login_email_still_works_legacy_path(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """Phase 5: 老用户用邮箱登录仍可用 (向后兼容)."""
    plain = "legacy-pwd"
    real_hash = bcrypt.hashpw(plain.encode(), bcrypt.gensalt(10)).decode()
    legacy = _make_user(email="legacy@x.com", password_hash=real_hash)
    setup_db_results([legacy])

    r = client.post(
        "/api/auth/login",
        json={"email": "legacy@x.com", "password": plain},
    )
    assert r.status_code == 200
    assert r.json()["accessToken"]


# ─── 类型注解兼容: setup_db_results / mock_db 用 Any (避免 mypy 跨文件推导抖) ───
# (无需手写 typing — pytest fixture 用法已 typed 在 conftest.py 内)


@pytest.mark.asyncio
async def test_register_endpoint_directly_returns_410_dict() -> None:
    """单元层: 直接 await 函数, 验返回 dict 形状 (不走 HTTP)。"""
    from app.api.v1.auth.router import register_deprecated

    body = await register_deprecated()
    assert body["error"] == "registration_endpoint_deprecated"
