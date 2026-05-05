"""
``app/lib/crypto.py`` — AES-256-GCM 测试。

测试矩阵:
  - round-trip: encrypt(plaintext, scope, scope_id) → decrypt 还原原始 plaintext
  - AAD 跨 scope 防移植: org 密文用 platform AAD 解密 → CryptoError
  - AAD 跨 scope_id 防移植: (org, A) 密文用 (org, B) 解密 → CryptoError
  - 常量: IV_LENGTH = 12, TAG_LENGTH = 16
  - 不同 IV 每次加密生成 (相同 plaintext 不会产生相同密文)
  - 主密钥配置错: 非 base64 / 长度不是 32 → CryptoError
  - 密文被篡改 → CryptoError (tag verification fail)
"""

from __future__ import annotations

import base64

import pytest

from app.core.config import get_settings
from app.lib.crypto import (
    IV_LENGTH,
    KEY_LENGTH,
    TAG_LENGTH,
    CryptoError,
    decrypt,
    encrypt,
)


@pytest.fixture(autouse=True)
def _crypto_test_env(base_env: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """每个 crypto 测试拿到完整 env (含 KEY_ENCRYPTION_KEY default)。"""
    base_env.setenv("NODE_ENV", "test")
    return base_env


def test_constants() -> None:
    """IV 12 / tag 16 / key 32 — 这些是 NIST GCM 推荐 + AES-256 硬约束, 改了 = 协议变更。"""
    assert IV_LENGTH == 12
    assert TAG_LENGTH == 16
    assert KEY_LENGTH == 32


def test_encrypt_returns_correct_tuple_shape() -> None:
    """``encrypt`` 返回 ``(encrypted_key, iv, tag)``, IV 12 字节, tag 16 字节。"""
    encrypted_key, iv, tag = encrypt("sk-secret", "org", "abc-123")

    assert isinstance(encrypted_key, bytes)
    assert isinstance(iv, bytes)
    assert isinstance(tag, bytes)
    assert len(iv) == IV_LENGTH
    assert len(tag) == TAG_LENGTH
    # encrypted_key 长度 = plaintext 字节数 (GCM 是流式, 无 padding)
    assert len(encrypted_key) == len(b"sk-secret")


def test_round_trip_org_scope() -> None:
    """encrypt → decrypt 还原原值 (org scope)。"""
    plaintext = "sk-some-very-secret-api-key-1234567890"
    encrypted_key, iv, tag = encrypt(plaintext, "org", "00000000-0000-0000-0000-000000000099")
    recovered = decrypt(encrypted_key, iv, tag, "org", "00000000-0000-0000-0000-000000000099")
    assert recovered == plaintext


def test_round_trip_platform_scope_with_none_id() -> None:
    """platform scope 时 scope_id=None, 解密时也用 None 还原。"""
    plaintext = "sk-platform-default-fallback-key"
    encrypted_key, iv, tag = encrypt(plaintext, "platform", None)
    recovered = decrypt(encrypted_key, iv, tag, "platform", None)
    assert recovered == plaintext


def test_aad_cross_scope_prevention_org_to_platform() -> None:
    """(org, X) 加密的密文 + (platform, None) AAD 解密 → CryptoError。"""
    encrypted_key, iv, tag = encrypt("sk-org-key", "org", "abc")

    with pytest.raises(CryptoError, match="tag verification failed"):
        decrypt(encrypted_key, iv, tag, "platform", None)


def test_aad_cross_scope_prevention_platform_to_org() -> None:
    """(platform, None) 加密的密文 + (org, X) AAD 解密 → CryptoError。

    防"密文跨 scope 移植攻击": 攻击者把 platform key 密文复制到 org 凭据行 →
    解密时 AAD 校验失败, 拒绝。
    """
    encrypted_key, iv, tag = encrypt("sk-platform-key", "platform", None)

    with pytest.raises(CryptoError, match="tag verification failed"):
        decrypt(encrypted_key, iv, tag, "org", "some-org-id")


def test_aad_cross_scope_id_prevention() -> None:
    """(org, A) 密文 + (org, B) AAD 解密 → CryptoError。

    org A 的密文不能在 org B 的凭据行解密 — 即使 scope 都是 'org'。
    """
    encrypted_key, iv, tag = encrypt("sk-orgA-key", "org", "org-A-uuid")

    with pytest.raises(CryptoError, match="tag verification failed"):
        decrypt(encrypted_key, iv, tag, "org", "org-B-uuid")


def test_unique_iv_per_call() -> None:
    """同 plaintext + 同 scope/scope_id 多次 encrypt, IV/密文/tag 都不同 (随机 IV)。"""
    plaintext = "sk-same-key"
    enc1, iv1, tag1 = encrypt(plaintext, "org", "abc")
    enc2, iv2, tag2 = encrypt(plaintext, "org", "abc")

    # IV 必须不同 (相同 IV 在 GCM 下会破灭安全性)
    assert iv1 != iv2
    # 不同 IV → 密文必不同 (GCM 是流式)
    assert enc1 != enc2
    # tag 也大概率不同 (因为 IV 不同 → 不同 tag)
    assert tag1 != tag2

    # 但都应能正确解密回原值
    assert decrypt(enc1, iv1, tag1, "org", "abc") == plaintext
    assert decrypt(enc2, iv2, tag2, "org", "abc") == plaintext


def test_tampered_ciphertext_raises() -> None:
    """密文被改 1 字节 → tag 校验失败 raise CryptoError。"""
    encrypted_key, iv, tag = encrypt("sk-secret", "org", "abc")

    # 翻第一个字节的最低位
    tampered = bytes([encrypted_key[0] ^ 0x01]) + encrypted_key[1:]

    with pytest.raises(CryptoError):
        decrypt(tampered, iv, tag, "org", "abc")


def test_tampered_tag_raises() -> None:
    """tag 被改 → 校验失败。"""
    encrypted_key, iv, tag = encrypt("sk-secret", "org", "abc")
    tampered_tag = bytes([tag[0] ^ 0x01]) + tag[1:]

    with pytest.raises(CryptoError):
        decrypt(encrypted_key, iv, tampered_tag, "org", "abc")


def test_invalid_iv_length_raises() -> None:
    """IV 长度 != 12 → CryptoError (硬约束)。"""
    encrypted_key, _iv, tag = encrypt("sk-secret", "org", "abc")
    bad_iv = b"\x00" * 8  # 8 bytes, 不是 12

    with pytest.raises(CryptoError, match="IV must be"):
        decrypt(encrypted_key, bad_iv, tag, "org", "abc")


def test_invalid_tag_length_raises() -> None:
    """tag 长度 != 16 → CryptoError。"""
    encrypted_key, iv, _tag = encrypt("sk-secret", "org", "abc")
    bad_tag = b"\x00" * 8  # 8 bytes, 不是 16

    with pytest.raises(CryptoError, match="Tag must be"):
        decrypt(encrypted_key, iv, bad_tag, "org", "abc")


def test_master_key_not_set_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """KEY_ENCRYPTION_KEY 设为空字符串 → CryptoError。

    Pydantic Settings 不允许 None 作 ``str`` 字段, 用空串模拟"未设置/被运维清空"。
    """
    monkeypatch.setenv("KEY_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    try:
        with pytest.raises(CryptoError, match="not set"):
            encrypt("sk-x", "org", "abc")
    finally:
        get_settings.cache_clear()


def test_master_key_invalid_base64_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """KEY_ENCRYPTION_KEY 不是合法 base64 → CryptoError。"""
    monkeypatch.setenv("KEY_ENCRYPTION_KEY", "this is not !!! valid base64 ###")
    get_settings.cache_clear()
    try:
        with pytest.raises(CryptoError, match="valid base64"):
            encrypt("sk-x", "org", "abc")
    finally:
        get_settings.cache_clear()


def test_master_key_wrong_length_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """KEY_ENCRYPTION_KEY base64 解码后不是 32 字节 → CryptoError。"""
    # 16 字节 base64 (AES-128 长度, 我们要 AES-256)
    short_key = base64.b64encode(b"x" * 16).decode()
    monkeypatch.setenv("KEY_ENCRYPTION_KEY", short_key)
    get_settings.cache_clear()
    try:
        with pytest.raises(CryptoError, match="32 bytes"):
            encrypt("sk-x", "org", "abc")
    finally:
        get_settings.cache_clear()


def test_unicode_plaintext_round_trip() -> None:
    """API key 偶尔含 unicode (label / 注释), encrypt/decrypt 走 UTF-8 应正确还原。"""
    plaintext = "sk-key-中文-😀"
    encrypted_key, iv, tag = encrypt(plaintext, "org", "abc")
    assert decrypt(encrypted_key, iv, tag, "org", "abc") == plaintext
