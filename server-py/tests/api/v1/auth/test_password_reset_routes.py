"""
Password reset routes — 镜像 ``server/src/modules/auth/password-reset.routes.test.ts``。

覆盖:
  - POST /forgot-password
      - 未知 email → 200, 不发邮件 (防枚举, password-reset.routes.test.ts:93-106)
      - 已知 email → 200 + DB 存 sha256(token) + 邮件含明文 token (link 含 token=[a-f0-9]{64})
                     (test:108-131)
      - 缺 email → 400 (Pydantic email 校验) (test:133-141)

  - POST /reset-password
      - 合法 token + new ≥6 → 200 + 改 password + 标 used_at (test:164-180)
      - token 不存在 → 400 (test:182-193)
      - token 已 used → 400 (test:195-206)
      - token 已过期 → 400 (test:208-219)
      - newPassword < 6 → 400 (Pydantic) (test:221-233)
      - 缺 token / newPassword → 400 (test:235-248)

安全不变量:
  - DB 只存 sha256(token), 邮件链接才有明文 → 即使 DB 泄漏, token 不可回放
  - 一次性 (used_at IS NOT NULL 即作废)
  - 15 分钟过期 (router 的 _TOKEN_TTL_MINUTES=15)

测试不连真 DB — mock AsyncSession + dependency override (见 conftest.py)。
sha256 / token 生成走真实库, 验真实 hash 一致性。
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from app.db.models.password_reset_tokens import PasswordResetToken
    from app.db.models.users import User
    from tests.api.v1.auth.conftest import SetupDbResults


# ─── 测试 helper ────────────────────────────────────────────────


def _make_user(
    *,
    email: str = "user@example.com",
    name: str = "Test User",
    user_id: uuid.UUID | None = None,
) -> User:
    """构造 ``User`` 实例 (不持久化)。"""
    from app.db.models.users import User

    user = User()
    user.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000001")
    user.email = email
    user.name = name
    user.password_hash = None  # 重置场景下原 hash 不重要
    user.is_system_admin = False
    return user


def _make_reset_token(
    *,
    user_id: uuid.UUID | None = None,
    token_hash: str = "any-hash",
    expires_at: datetime | None = None,
    used_at: datetime | None = None,
) -> PasswordResetToken:
    """构造 ``PasswordResetToken`` 实例 (不持久化)。"""
    from app.db.models.password_reset_tokens import PasswordResetToken

    now = datetime.now(UTC)
    row = PasswordResetToken()
    row.id = uuid.UUID("00000000-0000-0000-0000-000000000020")
    row.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000001")
    row.token_hash = token_hash
    row.expires_at = expires_at if expires_at is not None else (now + timedelta(minutes=10))
    row.used_at = used_at
    return row


# ─── POST /forgot-password ──────────────────────────────────────


def test_forgot_password_unknown_email_returns_200_without_sending(
    client: TestClient,
    setup_db_results: SetupDbResults,
    captured_emails: list[tuple[str, str]],
    mock_db: AsyncMock,
) -> None:
    """password-reset.routes.test.ts:93-106 镜像 — 未知邮箱 → 200, 不发邮件 (防枚举)。

    DB 查 user 返回 None, router 立即静默 200 (不走 token insert + mailer)。
    """
    setup_db_results([None])  # DB 查无此 user

    response = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # 关键: 邮件 NOT sent — 攻击者无法通过邮件签名 timing 探测账号
    assert len(captured_emails) == 0
    # 防回归: 也不该 insert token_row
    mock_db.add.assert_not_called()


def test_forgot_password_known_email_stores_hash_and_sends_link(
    client: TestClient,
    setup_db_results: SetupDbResults,
    captured_emails: list[tuple[str, str]],
    mock_db: AsyncMock,
) -> None:
    """password-reset.routes.test.ts:108-131 镜像 — 已知邮箱:
    - DB 插的 token_hash 必须是 sha256 hex (64 chars), 不能是明文
    - 邮件 reset_link 必须含 ``token=<明文 64 hex>`` query
    - 调用方拿到的是 200 (不暴露邮件成败)
    """
    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000005")
    user = _make_user(email="found@example.com", user_id=user_uuid)
    setup_db_results([user])

    response = client.post(
        "/api/auth/forgot-password",
        json={"email": "found@example.com"},
    )

    assert response.status_code == 200
    # 邮件已发, 收件人 + 链接形态对
    assert len(captured_emails) == 1
    to_addr, reset_link = captured_emails[0]
    assert to_addr == "found@example.com"
    # 链接含 token=<64-hex>
    import re

    match = re.search(r"token=([a-f0-9]{64})", reset_link)
    assert match is not None, f"reset_link 不含 token=<64-hex>: {reset_link}"
    plain_token = match.group(1)

    # DB 插的 token_hash 必须是 sha256(plain_token)
    mock_db.add.assert_called_once()
    inserted_token = mock_db.add.call_args.args[0]
    assert inserted_token.user_id == user_uuid
    expected_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    assert inserted_token.token_hash == expected_hash
    # 进一步保证: 不是明文回写
    assert inserted_token.token_hash != plain_token
    # token_hash 长度 + 形态
    assert len(inserted_token.token_hash) == 64
    assert all(c in "0123456789abcdef" for c in inserted_token.token_hash)

    # commit 调到 (token + last_login_at 之类)
    mock_db.commit.assert_awaited()


def test_forgot_password_missing_email_returns_400(client: TestClient) -> None:
    """password-reset.routes.test.ts:133-141 镜像 — 缺 email → Pydantic 校验 400。"""
    response = client.post("/api/auth/forgot-password", json={})
    assert response.status_code == 400


# ─── POST /reset-password ───────────────────────────────────────

# 64 字符 hex token (Pydantic schema pattern=r"^[a-f0-9]{64}$" 必须满足)
_VALID_TOKEN_A = "a" * 64
_VALID_TOKEN_B = "b" * 64
_VALID_TOKEN_C = "c" * 64
_VALID_TOKEN_D = "d" * 64
_VALID_TOKEN_E = "e" * 64
_VALID_TOKEN_F = "f" * 64


def test_reset_password_with_valid_token_succeeds(
    client: TestClient,
    setup_db_results: SetupDbResults,
    mock_db: AsyncMock,
) -> None:
    """password-reset.routes.test.ts:164-180 镜像 — 合法 token + 新密码 ≥6 →
    - 200 + ok=True
    - 用户 password_hash 被改写 (新值 != 旧值)
    - token.used_at 被标记 (不再是 None)
    - commit 一次 (与 Node 端两次 update 不同 — Python ORM 一次 commit 同事务)
    """
    plain_token = _VALID_TOKEN_A
    expected_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000030")

    token_row = _make_reset_token(user_id=user_uuid, token_hash=expected_hash)
    user = _make_user(email="reset@example.com", user_id=user_uuid)
    user.password_hash = None  # 显式开始时无密码

    # router 顺序: 先查 token, 再查 user
    setup_db_results([token_row, user])

    response = client.post(
        "/api/auth/reset-password",
        json={"token": plain_token, "newPassword": "NewSecure2026"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # 用户 password_hash 被改写
    assert user.password_hash is not None
    assert user.password_hash != ""
    # token used_at 已标记
    assert token_row.used_at is not None
    assert isinstance(token_row.used_at, datetime)
    mock_db.commit.assert_awaited()


def test_reset_password_with_unknown_token_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """password-reset.routes.test.ts:182-193 镜像 — token 在 DB 不存在 → 400。"""
    setup_db_results([None])  # 查 token → 无结果

    response = client.post(
        "/api/auth/reset-password",
        json={"token": _VALID_TOKEN_B, "newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400


def test_reset_password_with_used_token_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """password-reset.routes.test.ts:195-206 镜像 — token.used_at IS NOT NULL → 一次性
    保护拒绝二次使用。"""
    plain_token = _VALID_TOKEN_C
    used_token_row = _make_reset_token(
        token_hash=hashlib.sha256(plain_token.encode()).hexdigest(),
        used_at=datetime.now(UTC) - timedelta(minutes=1),  # 1 分钟前已用过
    )
    setup_db_results([used_token_row])

    response = client.post(
        "/api/auth/reset-password",
        json={"token": plain_token, "newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400


def test_reset_password_with_expired_token_returns_400(
    client: TestClient,
    setup_db_results: SetupDbResults,
) -> None:
    """password-reset.routes.test.ts:208-219 镜像 — expires_at < now → 400 (15min TTL 触底)。"""
    plain_token = _VALID_TOKEN_D
    expired_token_row = _make_reset_token(
        token_hash=hashlib.sha256(plain_token.encode()).hexdigest(),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),  # 1 分钟前已过期
    )
    setup_db_results([expired_token_row])

    response = client.post(
        "/api/auth/reset-password",
        json={"token": plain_token, "newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400


def test_reset_password_with_short_password_returns_400(client: TestClient) -> None:
    """password-reset.routes.test.ts:221-233 镜像 — newPassword < 6 → Pydantic 校验
    在到 router 前就拒。"""
    response = client.post(
        "/api/auth/reset-password",
        json={"token": _VALID_TOKEN_E, "newPassword": "123"},
    )
    assert response.status_code == 400


def test_reset_password_missing_token_returns_400(client: TestClient) -> None:
    """password-reset.routes.test.ts:235-248 镜像 — 缺 token (但有 newPassword) → 400。"""
    response = client.post(
        "/api/auth/reset-password",
        json={"newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400


def test_reset_password_missing_new_password_returns_400(client: TestClient) -> None:
    """password-reset.routes.test.ts:235-248 镜像 — 缺 newPassword (但有 token) → 400。"""
    response = client.post(
        "/api/auth/reset-password",
        json={"token": _VALID_TOKEN_F},
    )
    assert response.status_code == 400


# ─── crypto invariants (镜像 password-reset.routes.test.ts:253-261) ──


def test_sha256_token_is_idempotent() -> None:
    """sha256(token) 必须可从明文 token 一致重算 — 否则 verify 路径就是单向坏掉的。"""
    import secrets

    token = secrets.token_hex(32)  # 64 chars hex (与 router._generate_reset_token 同)
    hash_a = hashlib.sha256(token.encode()).hexdigest()
    hash_b = hashlib.sha256(token.encode()).hexdigest()
    assert hash_a == hash_b
    assert len(hash_a) == 64
    assert all(c in "0123456789abcdef" for c in hash_a)


# ─── 额外覆盖: token format 校验 (Pydantic pattern) ─────────────


def test_reset_password_with_non_hex_token_returns_400(client: TestClient) -> None:
    """schema pattern=r"^[a-f0-9]{64}$": 64 字符但含非 hex (e.g. 大写) → 400。

    防回归: 早期版本若把 pattern 摘掉, 攻击者就能传任意字符串绕过 sha256 lookup。
    """
    bad_token = "Z" * 64  # 64 长度但含非 hex 字符
    response = client.post(
        "/api/auth/reset-password",
        json={"token": bad_token, "newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400


def test_reset_password_with_short_token_returns_400(client: TestClient) -> None:
    """schema min_length=64 — 非 64 字符直接拒。"""
    response = client.post(
        "/api/auth/reset-password",
        json={"token": "abc", "newPassword": "NewSecure2026"},
    )
    assert response.status_code == 400
