"""
AES-256-GCM 加密 / 解密 — BYOK (org-level AI 凭据) 安全核心。

业务场景:
  ``ai_credentials.encrypted_key`` / ``encryption_iv`` / ``encryption_tag`` 三列
  存储 AES-256-GCM 密文 + IV (12 字节) + tag (16 字节)。明文 API key 永不落地, 仅
  在 ``resolve_ai_credential`` 时即时解密注入 provider 的 Bearer header。

设计要点:

  1. **AES-256-GCM**: 对称分组密码 + 认证模式, 一次加密同时拿到密文 + tag (检测篡改)。
     比 AES-CBC + HMAC 双步 + 易错 IV 复用风险低。``cryptography`` 库的 AESGCM 接口
     直接走 NIST SP 800-38D 标准。

  2. **主密钥**: env ``KEY_ENCRYPTION_KEY`` (32 bytes base64), 与 JWT_SECRET 同等级 secret 管理。
     部署时由运维生成 (``python -c "import secrets, base64;
     print(base64.b64encode(secrets.token_bytes(32)).decode())"``) + 写到 docker secret /
     k8s secret / .env (production)。**production 必须改默认值**, dev 默认值仅供 unit test。

  3. **AAD (Additional Authenticated Data)**: ``f"{scope}:{scope_id}".encode()``。
     绑死 (scope, scope_id) → 把 platform 凭据密文 paste 到 org 凭据行 (or 反向),
     decrypt 校验 tag 失败 raise ``InvalidTag`` (400)。防"密文跨 scope 移植攻击" —
     即使 DB 被横向打穿, 攻击者也不能拿 platform key 替换某 org 的 key 来劫持流量。

  4. **IV (Initialization Vector)**: 12 字节随机 (NIST 推荐 GCM 用 96-bit IV)。
     ``os.urandom(12)`` 每次加密重新生成 — IV 重复会导致 GCM 安全性彻底失效,
     不要复用!

  5. **tag**: 16 字节 (NIST 推荐 128-bit GCM tag)。与 IV 一起回传, 解密时校验。

  6. **encrypt/decrypt 仅处理 str**: API key 是 ASCII 文本, ``.encode("utf-8")`` /
     ``.decode("utf-8")`` 双向。二进制 secret 不在本模块支持。

测试矩阵 (``tests/lib/test_crypto.py``):
  - round-trip: encrypt → decrypt 还原原始 key
  - AAD 跨 scope 防移植: 用 (org, X) 的 ciphertext + (platform, None) 的 AAD 解密 → InvalidTag
  - IV 长度 = 12, tag 长度 = 16 (硬约束, 不可变)
  - 不同 IV 每次加密生成 (相同 plaintext 不会产生相同密文)
"""

from __future__ import annotations

import base64
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings
from app.lib.errors import AppError

# ── 常量 ─────────────────────────────────────────────────────────

# NIST SP 800-38D 推荐 GCM IV 长度 = 12 bytes (96-bit), 短/长都可能降低安全边界
IV_LENGTH = 12
# NIST SP 800-38D 推荐 GCM tag 长度 = 16 bytes (128-bit)
TAG_LENGTH = 16
# AES-256 密钥长度 = 32 bytes
KEY_LENGTH = 32


# ── Errors ───────────────────────────────────────────────────────


class CryptoError(AppError):
    """500 — 加密 / 解密失败 (主密钥配置错 / 密文损坏 / AAD mismatch)。

    DB 里 ``encrypted_key`` 损坏或 AAD 跨 scope 串了 → CryptoError, route handler
    回 500 (服务端配置错或数据完整性问题, 不是 client 错), error_handler 自动转 JSON。
    """

    def __init__(self, message: str = "Crypto operation failed") -> None:
        super().__init__(status_code=500, message=message, code="CRYPTO_ERROR")


# ── 主密钥读取 ───────────────────────────────────────────────────


def _load_master_key() -> bytes:
    """从 env ``KEY_ENCRYPTION_KEY`` 加载主密钥, base64 → 32 bytes。

    任何配置错误立刻 raise ``CryptoError`` — 加密路径绝不允许"静默使用弱密钥"。
    """
    settings = get_settings()
    raw = settings.KEY_ENCRYPTION_KEY
    if not raw:
        raise CryptoError("KEY_ENCRYPTION_KEY env var is not set")
    try:
        key_bytes = base64.b64decode(raw, validate=True)
    except (ValueError, base64.binascii.Error) as exc:  # type: ignore[attr-defined]
        raise CryptoError("KEY_ENCRYPTION_KEY must be valid base64") from exc
    if len(key_bytes) != KEY_LENGTH:
        raise CryptoError(
            f"KEY_ENCRYPTION_KEY must decode to {KEY_LENGTH} bytes (AES-256), got {len(key_bytes)}"
        )
    return key_bytes


# ── AAD 构造 ─────────────────────────────────────────────────────


def _build_aad(scope: str, scope_id: str | None) -> bytes:
    """构造 GCM AAD: ``f"{scope}:{scope_id}".encode("utf-8")``。

    platform scope (scope_id is None) → ``"platform:"``。
    org scope (scope_id = "abc-123") → ``"org:abc-123"``。

    AAD 不参与加密 (不会出现在密文里), 但参与 tag 计算 → 解密时 AAD 必须 1:1 一致才算
    认证通过。这是防"密文跨 scope 移植"的关键。
    """
    sid = scope_id or ""
    return f"{scope}:{sid}".encode()


# ── encrypt / decrypt ────────────────────────────────────────────


def encrypt(plaintext: str, scope: str, scope_id: str | None) -> tuple[bytes, bytes, bytes]:
    """AES-256-GCM 加密 ``plaintext``, 返回 ``(encrypted_key, iv, tag)``。

    Args:
        plaintext: 明文 API key (UTF-8 字符串)
        scope: ``'platform'`` | ``'org'`` (与 ``ai_credentials.scope`` 列对齐)
        scope_id: org scope 时是 org_id; platform scope 时是 None

    Returns:
        ``(encrypted_key, iv, tag)``:
          - ``encrypted_key`` (bytes): 密文 (任意长度)
          - ``iv`` (bytes): 12 字节随机 IV
          - ``tag`` (bytes): 16 字节 GCM tag

    Raises:
        CryptoError: 主密钥配置错误。
    """
    key = _load_master_key()
    iv = os.urandom(IV_LENGTH)
    aad = _build_aad(scope, scope_id)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt 返回 ciphertext || tag (拼一起)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), aad)
    # 末尾 16 字节是 tag, 前面是真正密文
    encrypted_key = ciphertext_with_tag[:-TAG_LENGTH]
    tag = ciphertext_with_tag[-TAG_LENGTH:]
    return encrypted_key, iv, tag


def decrypt(
    encrypted_key: bytes,
    iv: bytes,
    tag: bytes,
    scope: str,
    scope_id: str | None,
) -> str:
    """AES-256-GCM 解密 ``encrypted_key``, 返回明文 API key 字符串。

    Args:
        encrypted_key: encrypt 返回的密文 (bytes)
        iv: encrypt 返回的 12 字节 IV
        tag: encrypt 返回的 16 字节 tag
        scope: 与加密时一致
        scope_id: 与加密时一致 (跨 scope 串会 raise CryptoError)

    Raises:
        CryptoError: 主密钥配置错误 / IV 长度错 / tag 长度错 / tag 校验失败 (AAD
            mismatch 或密文被篡改)。
    """
    key = _load_master_key()
    if len(iv) != IV_LENGTH:
        raise CryptoError(f"IV must be {IV_LENGTH} bytes, got {len(iv)}")
    if len(tag) != TAG_LENGTH:
        raise CryptoError(f"Tag must be {TAG_LENGTH} bytes, got {len(tag)}")
    aad = _build_aad(scope, scope_id)
    aesgcm = AESGCM(key)
    try:
        plaintext_bytes = aesgcm.decrypt(iv, encrypted_key + tag, aad)
    except InvalidTag as exc:
        # AAD mismatch (跨 scope 移植) / 密文被篡改 / 主密钥换了 — 都是 InvalidTag
        raise CryptoError(
            "Decryption failed: tag verification failed (AAD mismatch or tampered ciphertext)"
        ) from exc
    return plaintext_bytes.decode("utf-8")


__all__ = [
    "IV_LENGTH",
    "KEY_LENGTH",
    "TAG_LENGTH",
    "CryptoError",
    "decrypt",
    "encrypt",
]
