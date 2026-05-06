"""JWT (HS256) + bcrypt 工具。

镜像 server/src/middleware/auth.ts + server/src/modules/auth/auth.routes.ts。

**W3.4 安全审计 (2026-05-03) 重做:**
  decode_token 必须 pin algorithms=['HS256'], 否则 alg=none 或 HS↔RS confusion
  能伪造任意 token (含 isSystemAdmin=True 的伪造管理员 token)。原 Node 修复
  见 commit 4699166。

**Cross-compat 硬约束:**
  - bcryptjs.hashSync(_, 10) 产生的 hash, bcrypt.checkpw 必须能验
  - jsonwebtoken.sign(_, secret, {algorithm:'HS256'}) 产生的 token, PyJWT 必须能 decode
  - 反之亦然 (Phase 6 切流前 overlap 期, Node 与 Python 共享同一份 dev DB + JWT_SECRET)

**为什么不用 passlib:**
  passlib 1.7.4 读 ``bcrypt.__about__.__version__``, 但 bcrypt 4.0+ 删了这个属性,
  导致 passlib 把 bcrypt backend 标 unavailable, 所有 hash/verify 抛 ValueError。
  passlib 1.8 还没 release。直接用 bcrypt 库简单且无此坑。

测试: tests/core/test_security.py 用真实 Node 端 fixtures 验证互通。
"""

from __future__ import annotations

import time
from typing import Any

import bcrypt
import jwt as pyjwt

from app.core.config import get_settings

# bcrypt cost factor — 必须等于 Node 端 bcrypt.hash(_, 10) (auth.routes.ts:178)。
# Phase X (W3.2 ticket) 会评估升到 12, 接受 250ms 登录延迟。
BCRYPT_ROUNDS = 10

# JWT 签名算法 — 与 server/src/middleware/auth.ts:37 的 algorithms:['HS256'] 对齐
JWT_ALGORITHM = "HS256"

# 过期时间 — 与 server/src/modules/auth/auth.routes.ts:14-15 默认值对齐。
# Node 端用 getBootValue('security', 'accessTokenExpiry', '7d') 走运行时
# 配置, Python 端 Phase 1.1 先 hardcode 默认值, Phase 1.2+ 接 boot 配置时改。
ACCESS_TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days
REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 3600  # 30 days


# ─── bcrypt ──────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Hash 明文密码, 返回 ``$2b$10$<22-char-salt><31-char-hash>`` 格式。

    bcrypt 库默认 ident 是 ``$2b$`` (与 bcryptjs 默认一致), 与现 dev DB 现有
    数据风格统一, 无需 prefix:option。
    """
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    校验明文 vs bcrypt hash。bcryptjs 与 Python bcrypt 都遵循 OpenBSD bcrypt
    标准, 对方产生的 hash 双向兼容 ($2a$ / $2b$ / $2y$ ident 都识别)。

    Hash 格式异常 (DB 里有非 bcrypt 字符串) 不抛, 返回 False —— 模仿 Node 端
    bcrypt.compare 的行为, 避免攻击者通过 hash 格式探测账号状态。
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # 'Invalid salt' / 类型错 / 编码异常 → 视作不匹配
        return False


# ─── Timing channel mitigation (Phase 5 P0 Fix 7) ────────────────

# 启动期一次性生成 dummy hash, 用于"用户不存在/无密码"路径消耗 bcrypt CPU 时间。
# 这个 hash 永远不会被作为 truth 使用 — 我们只关心 checkpw 调用本身的耗时。
#
# 注: 不能用 module-level eager init (gensalt 是 250ms 启动延迟); 用 lazy singleton。
_DUMMY_PASSWORD_HASH: bytes | None = None


def _get_dummy_hash() -> bytes:
    """Lazy init dummy hash — 第一次调用时生成, 之后复用 (节约启动期 250ms)。"""
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
    return _DUMMY_PASSWORD_HASH


def burn_password_verification_time(plain: str) -> None:
    """**安全** — 仅消耗 bcrypt CPU 时间, 让"用户不存在"路径耗时 ≈ "用户存在"路径。

    Phase 5 P0 fix (Fix 7): 防 timing-channel 邮箱/手机号枚举。

    场景:
      - login: 用户不存在 / password_hash 为空时调用此函数, 不返回任何信息。
      - forgot-password: 邮箱不存在时调用, 让 200 响应耗时与已知邮箱一致 (BackgroundTasks
        的 email send 已经是异步, 唯一同步差就是 hash 校验本身)。
      - public counseling/eap register: 错密码分支也要补一次 (与 W0.4 的 verify_password
        一起, 让"用户存在但密码错" 与 "用户不存在但走 dummy" 耗时相近)。

    复杂度: O(BCRYPT_ROUNDS) ≈ 250ms @ rounds=10。**不要在热路径循环里调用**。
    """
    import contextlib

    with contextlib.suppress(ValueError, TypeError):
        # 编码 / 格式异常都 swallow — 此函数纯副作用, 不抛
        bcrypt.checkpw(plain.encode("utf-8"), _get_dummy_hash())


# ─── JWT ────────────────────────────────────────────────────────


def create_access_token(*, user_id: str, email: str | None, is_system_admin: bool) -> str:
    """
    签发 access token。Claims 与 Node signTokens() (auth.routes.ts:18-22) 一致:
      { sub, email, isSystemAdmin, iat, exp }

    用 keyword-only 防调用方误把 email 当 user_id 传 (string 型号容易混)。
    """
    settings = get_settings()
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "isSystemAdmin": is_system_admin,
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRY_SECONDS,
    }
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(*, user_id: str) -> str:
    """
    签发 refresh token。Claims 与 Node signTokens() (auth.routes.ts:24-27) 一致:
      { sub, type:'refresh', iat, exp }

    type='refresh' 是关键区分位 — auth.routes.ts:115 在 /refresh 端点强校验
    payload.type === 'refresh', 防 access token 被当 refresh 用。
    """
    settings = get_settings()
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "type": "refresh",
        "iat": now,
        "exp": now + REFRESH_TOKEN_EXPIRY_SECONDS,
    }
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, *, verify_exp: bool = True) -> dict[str, Any]:
    """
    校验并 decode JWT。

    **algorithms=['HS256'] 必须 pin (W3.4)**: 不 pin 的话 PyJWT (像
    jsonwebtoken 早期) 会接受 alg=none 或 HS↔RS confusion 的 token, 攻击者
    可伪造 isSystemAdmin=True 的管理员 token。

    异常透传 (符合 PyJWT 习惯, 由 middleware/error_handler 转 HTTP 401):
      - ExpiredSignatureError: token 过期
      - InvalidSignatureError: secret 不对
      - InvalidAlgorithmError: alg 非 HS256 (含 alg=none 攻击)
      - DecodeError: 格式损坏
      - InvalidTokenError: 通用基类, catch-all
    """
    settings = get_settings()
    return pyjwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[JWT_ALGORITHM],
        options={"verify_exp": verify_exp},
    )
