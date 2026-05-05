"""
``app/api/v1/ai/credential_resolver.py`` 测试 — fallback chain + PHI residency + decrypt.

不在模块顶层 import app.* (它会触发 engine 创建 → 在 collection 阶段 settings 还没加载),
全部在 fixture / 测试函数内部 lazy import.
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

_FAKE_ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")


@pytest.fixture(autouse=True)
def _resolver_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_cred(
    *,
    scope: str,
    scope_id: uuid.UUID | None,
    plaintext: str,
    provider: str = "openai-compatible",
    data_residency: str = "cn",
    is_default: bool = True,
    is_disabled: bool = False,
) -> Any:
    from app.db.models.ai_credentials import AICredential
    from app.lib.crypto import encrypt

    sid = str(scope_id) if scope_id else None
    enc, iv, tag = encrypt(plaintext, scope, sid)

    c = AICredential()
    c.id = uuid.uuid4()
    c.scope = scope
    c.scope_id = scope_id
    c.provider = provider
    c.base_url = "https://api.example.com"
    c.model = "test-model"
    c.encrypted_key = enc
    c.encryption_iv = iv
    c.encryption_tag = tag
    c.data_residency = data_residency
    c.is_default = is_default
    c.is_disabled = is_disabled
    c.label = None
    c.created_by = uuid.uuid4()
    c.rotated_at = None
    c.last_used_at = None
    c.last_error_at = None
    return c


def _wrap(value: Any) -> Any:
    res = MagicMock()
    res.scalar_one_or_none = MagicMock(return_value=value)
    res.scalar = MagicMock(return_value=value)
    res.first = MagicMock(return_value=value)
    return res


def _setup_db_returns(rows: list[Any]) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_wrap(r) for r in rows])
    return db


@pytest.mark.asyncio
async def test_org_credential_present_returns_org() -> None:
    from app.api.v1.ai.credential_resolver import (
        ResolvedCredential,
        resolve_ai_credential,
    )

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-org-key-123")
    db = _setup_db_returns([cred, {"orgType": "counseling"}])
    result = await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)
    assert isinstance(result, ResolvedCredential)
    assert result.api_key == "sk-org-key-123"
    assert result.scope == "org"
    assert result.data_residency == "cn"


@pytest.mark.asyncio
async def test_org_missing_falls_back_to_platform() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    plat = _make_cred(scope="platform", scope_id=None, plaintext="sk-platform-key")
    db = _setup_db_returns([None, plat, {}])
    result = await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)
    assert result.api_key == "sk-platform-key"
    assert result.scope == "platform"


@pytest.mark.asyncio
async def test_org_and_platform_missing_raises() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential
    from app.lib.errors import ValidationError

    db = _setup_db_returns([None, None])
    with pytest.raises(ValidationError, match="not configured"):
        await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)


@pytest.mark.asyncio
async def test_phi_residency_global_blocked_without_consent() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential
    from app.lib.errors import PHIComplianceError

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-x", data_residency="global")
    db = _setup_db_returns([cred, {"orgType": "counseling"}])
    with pytest.raises(PHIComplianceError, match="PHI 出境同意"):
        await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)


@pytest.mark.asyncio
async def test_phi_residency_global_allowed_with_consent() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-x", data_residency="global")
    db = _setup_db_returns([cred, {"consentsToPhiExport": True}])
    result = await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)
    assert result.api_key == "sk-x"
    assert result.data_residency == "global"


@pytest.mark.asyncio
async def test_phi_residency_cn_always_allowed() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-cn", data_residency="cn")
    db = _setup_db_returns([cred, {}])
    result = await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)
    assert result.api_key == "sk-cn"


@pytest.mark.asyncio
async def test_invalid_org_id_string_raises() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential
    from app.lib.errors import ValidationError

    db = _setup_db_returns([])
    with pytest.raises(ValidationError, match="orgId"):
        await resolve_ai_credential(db, org_id="not-a-uuid")


@pytest.mark.asyncio
async def test_org_id_string_uuid_works() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-x")
    db = _setup_db_returns([cred, {}])
    result = await resolve_ai_credential(db, org_id=str(_FAKE_ORG_ID))
    assert result.api_key == "sk-x"


@pytest.mark.asyncio
async def test_no_org_id_skips_org_query() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    plat = _make_cred(scope="platform", scope_id=None, plaintext="sk-platform-only")
    db = _setup_db_returns([plat])
    result = await resolve_ai_credential(db, org_id=None)
    assert result.api_key == "sk-platform-only"
    assert result.scope == "platform"
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_decrypt_failure_propagates() -> None:
    from app.api.v1.ai.credential_resolver import resolve_ai_credential
    from app.lib.crypto import CryptoError

    cred = _make_cred(scope="org", scope_id=_FAKE_ORG_ID, plaintext="sk-x")
    cred.encrypted_key = bytes([cred.encrypted_key[0] ^ 0x01]) + cred.encrypted_key[1:]
    db = _setup_db_returns([cred, {}])
    with pytest.raises(CryptoError):
        await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)


@pytest.mark.asyncio
async def test_disabled_credential_query_returns_none_then_fallback() -> None:
    """``is_disabled=True`` 在 query 层已过滤 (是 WHERE 条件), 此处验 query 返 None → fallback."""
    from app.api.v1.ai.credential_resolver import resolve_ai_credential

    plat = _make_cred(scope="platform", scope_id=None, plaintext="sk-fallback")
    db = _setup_db_returns([None, plat, {}])
    result = await resolve_ai_credential(db, org_id=_FAKE_ORG_ID)
    assert result.scope == "platform"
