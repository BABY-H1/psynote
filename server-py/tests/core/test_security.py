"""
Tests for app/core/security.py — JWT (HS256) + bcrypt.

镜像 server/src/middleware/auth.ts + server/src/modules/auth/auth.routes.ts。

**W3.4 安全审计 (2026-05-03) 重做:**
  jwt.verify 必须 pin algorithms=['HS256'], 否则 alg=none 或 RS256 confusion
  能伪造任意 token。原 Node 修复见 commit 4699166。

**Cross-compat 真实 fixture:**
  下方常量是 Node bcryptjs/jsonwebtoken 真实生成的产物 (脚本见 commit 历史),
  确保 passlib + PyJWT 能 1:1 验证 Node 端写入数据库的 hash 与签发的 token。
  这是迁移期 (Node 写, Python 读 / Python 写, Node 读) 的硬约束。
"""

from __future__ import annotations

import time
from typing import cast

import jwt as pyjwt
import pytest

# ─── Cross-compat fixture (Node 端真实生成) ─────────────────────
TEST_SECRET = "phase1-cross-compat-secret-32chars-min"
TEST_PASSWORD = "test-password-1234"

# bcryptjs.hashSync(TEST_PASSWORD, 10) — passlib.verify 必须能验
NODE_BCRYPTJS_HASH = "$2b$10$MfaM7CYl3MlfxVPRBgtdce9saJZONCZOG..uKRknS9B1FuJM/sNV2"

# jsonwebtoken.sign({sub,email,isSystemAdmin}, secret, alg=HS256, exp=7d)
# 这个 token 在 7 天后会过期, 测试只验 decode 不验时间敏感断言。
NODE_ACCESS_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyLWNyb3NzLWNvbXBhdC0xIiwiZW1haWwiOiJjcm9zc2NvbXBhdEBleGFtcGxlLmNvbSIsImlzU3lzdGVtQWRtaW4iOmZhbHNlLCJpYXQiOjE3Nzc4MjQwMDMsImV4cCI6MTc3ODQyODgwM30."
    "32ou7hPgfjavIYfCn61nectjAxcjrWjEDcOB72hDOdA"
)

# jsonwebtoken.sign({sub, type:'refresh'}, secret, alg=HS256, exp=30d)
NODE_REFRESH_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyLWNyb3NzLWNvbXBhdC0xIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc4MjQwMDMsImV4cCI6MTc4MDQxNjAwM30."
    "AtZYN2UWValR8m5m886sB5kwGttWd7YfqM1ipEtKnN0"
)

# 已过期的 token (jsonwebtoken expiresIn:'-1s')
NODE_EXPIRED_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyLTEiLCJpYXQiOjE3Nzc4MjQwMDMsImV4cCI6MTc3NzgyNDAwMn0."
    "q2W_6WKhQ3tfIQ4zpgyUCbd0PcKOlXx1KmspYOsiU2g"
)

# alg=none 攻击向量 (W3.4): header={alg:none}, signature 为空字符串
ALG_NONE_TOKEN = (
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciIsImlzU3lzdGVtQWRtaW4iOnRydWV9."
)


# ─── bcrypt ──────────────────────────────────────────────────────


def test_hash_password_returns_bcrypt_format() -> None:
    from app.core.security import hash_password

    hashed = hash_password("anything")
    # bcrypt 标准格式: $2a$ 或 $2b$ + cost + $ + 22-char salt + 31-char hash
    assert hashed.startswith(("$2a$", "$2b$", "$2y$"))


def test_hash_password_uses_cost_12() -> None:
    """Phase 5 P1 (2026-05-06) 升到 12 — Node 旧 $2b$10$ hash 仍能 verify, 新 hash
    cost 升级到 12 (爆破成本 ×4)。原 Node 端 auth.routes.ts:178 是 bcrypt.hash(_, 10),
    Phase 6 切流后 Node 不再写 hash, 此差异自然消化。
    """
    from app.core.security import hash_password

    hashed = hash_password("anything")
    # 第二段是 cost factor
    assert hashed.split("$")[2] == "12"


def test_verify_legacy_node_hash_at_cost_10() -> None:
    """Backward compat: Node 端历史用 bcrypt.hash(_, 10) 写入的 $2b$10$ hash, Python
    端 verify 必须仍然通过 (bcrypt 标准 — cost 嵌在 hash 里, verify 自动读取)。

    硬约束: Phase 6 切流前 dev DB 里同时存在 $2b$10$ (Node 写) 和 $2b$12$ (Python 写)
    两种 cost 的 hash, 都必须能 verify。
    """
    import bcrypt

    from app.core.security import verify_password

    # 模拟 Node 端 bcryptjs.hashSync('legacy-pw', 10) 产物
    legacy_hash = bcrypt.hashpw(b"legacy-pw", bcrypt.gensalt(rounds=10)).decode()
    assert legacy_hash.split("$")[2] == "10"  # 确认是 cost-10
    assert verify_password("legacy-pw", legacy_hash) is True
    assert verify_password("wrong-pw", legacy_hash) is False


def test_verify_password_correct() -> None:
    from app.core.security import hash_password, verify_password

    hashed = hash_password("correct-pw-123")
    assert verify_password("correct-pw-123", hashed) is True


def test_verify_password_wrong() -> None:
    from app.core.security import hash_password, verify_password

    hashed = hash_password("correct-pw-123")
    assert verify_password("wrong-pw", hashed) is False


def test_verify_node_bcryptjs_hash_interop() -> None:
    """
    Cross-compat critical: passlib 必须能验证 Node bcryptjs.hashSync 产生的 hash。
    迁移期 (Phase 6 切流前) 现有 dev DB user.passwordHash 都是 bcryptjs 写的,
    Python 端必须能识别。
    """
    from app.core.security import verify_password

    assert verify_password(TEST_PASSWORD, NODE_BCRYPTJS_HASH) is True
    assert verify_password("wrong-password", NODE_BCRYPTJS_HASH) is False


# ─── JWT — sign + decode round trip ─────────────────────────────


def test_create_access_token_returns_string(
    base_env: pytest.MonkeyPatch,
) -> None:
    """JWT 必须是 string (不是 bytes), 与 jsonwebtoken 行为一致"""
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_access_token

    token = create_access_token(user_id="u1", email="a@b.com", is_system_admin=False)
    assert isinstance(token, str)
    assert token.count(".") == 2  # JWT 三段式


def test_access_token_payload_matches_node_shape(
    base_env: pytest.MonkeyPatch,
) -> None:
    """access token claims 必须和 Node signTokens() 输出一致: sub/email/isSystemAdmin"""
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_access_token, decode_token

    token = create_access_token(user_id="user-42", email="x@y.com", is_system_admin=True)
    payload = decode_token(token)
    assert payload["sub"] == "user-42"
    assert payload["email"] == "x@y.com"
    assert payload["isSystemAdmin"] is True


def test_access_token_expiry_around_7_days(
    base_env: pytest.MonkeyPatch,
) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_access_token, decode_token

    before = int(time.time())
    token = create_access_token(user_id="u1", email=None, is_system_admin=False)
    payload = decode_token(token)
    seven_days = 7 * 24 * 3600
    diff = payload["exp"] - before
    # 容忍 5 秒钟 jitter
    assert seven_days - 5 <= diff <= seven_days + 5


def test_create_refresh_token_payload(
    base_env: pytest.MonkeyPatch,
) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_refresh_token, decode_token

    token = create_refresh_token(user_id="u1")
    payload = decode_token(token)
    assert payload["sub"] == "u1"
    assert payload["type"] == "refresh"


def test_refresh_token_expiry_around_30_days(
    base_env: pytest.MonkeyPatch,
) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_refresh_token, decode_token

    before = int(time.time())
    token = create_refresh_token(user_id="u1")
    payload = decode_token(token)
    thirty_days = 30 * 24 * 3600
    diff = payload["exp"] - before
    assert thirty_days - 5 <= diff <= thirty_days + 5


# ─── JWT — Cross-compat (Node sign → Python verify) ─────────────


def test_decode_node_signed_access_token(base_env: pytest.MonkeyPatch) -> None:
    """
    Cross-compat critical: PyJWT 必须能验证 jsonwebtoken HS256 token。
    迁移期 (overlap) 客户端可能拿着 Node 签的 token 调 Python service。
    """
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import decode_token

    # token 已经过期 (生成于 2025-09), 跳过 exp 校验只测 sig + claims
    payload = decode_token(NODE_ACCESS_TOKEN, verify_exp=False)
    assert payload["sub"] == "user-cross-compat-1"
    assert payload["email"] == "crosscompat@example.com"
    assert payload["isSystemAdmin"] is False


def test_decode_node_signed_refresh_token(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import decode_token

    payload = decode_token(NODE_REFRESH_TOKEN, verify_exp=False)
    assert payload["sub"] == "user-cross-compat-1"
    assert payload["type"] == "refresh"


# ─── JWT — Rejection paths ──────────────────────────────────────


def test_decode_rejects_expired_token(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import decode_token

    with pytest.raises(pyjwt.ExpiredSignatureError):
        decode_token(NODE_EXPIRED_TOKEN)


def test_decode_rejects_wrong_secret(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("JWT_SECRET", "completely-different-secret-32chars!")
    from app.core.security import decode_token

    with pytest.raises(pyjwt.InvalidSignatureError):
        decode_token(NODE_ACCESS_TOKEN, verify_exp=False)


def test_decode_rejects_alg_none(base_env: pytest.MonkeyPatch) -> None:
    """
    W3.4 critical: alg=none 攻击。如果 PyJWT 未 pin algorithms=['HS256'],
    带 alg=none 的 token 可以伪造 isSystemAdmin=True。
    必须 raise (具体 exception 类型 PyJWT 是 InvalidAlgorithmError)。
    """
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import decode_token

    with pytest.raises((pyjwt.InvalidAlgorithmError, pyjwt.DecodeError)):
        decode_token(ALG_NONE_TOKEN)


def test_decode_rejects_malformed_token(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import decode_token

    with pytest.raises(pyjwt.DecodeError):
        decode_token("not.a.jwt")


# ─── Settings 集成 (security 应该读 settings.JWT_SECRET) ───────


def test_security_uses_settings_jwt_secret(base_env: pytest.MonkeyPatch) -> None:
    """
    W0.3 验证: security 不应有硬编码 default 密钥, 必须走 settings。
    secret 改了 cache_clear 后, 新 sign/verify 应用新值。
    """
    base_env.setenv("JWT_SECRET", "first-secret-32-chars-aaaaaaaaaaaa")
    from app.core.config import get_settings
    from app.core.security import create_access_token, decode_token

    token1 = create_access_token(user_id="u1", email=None, is_system_admin=False)
    decode_token(token1)  # 自身 secret 验自己, 通过

    # 换 secret + 清 cache, 旧 token 应被拒
    base_env.setenv("JWT_SECRET", "second-secret-32-chars-bbbbbbbbbbb")
    get_settings.cache_clear()
    with pytest.raises(pyjwt.InvalidSignatureError):
        decode_token(token1)


# ─── 类型签名 (sanity) ────────────────────────────────────────


def test_decode_token_returns_dict(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("JWT_SECRET", TEST_SECRET)
    from app.core.security import create_access_token, decode_token

    payload = decode_token(create_access_token(user_id="u1", email=None, is_system_admin=False))
    assert isinstance(payload, dict)
    # 关键 claims 都在
    for key in ("sub", "exp", "iat"):
        assert key in cast(dict, payload)
