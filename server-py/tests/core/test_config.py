"""
Tests for app/core/config.py — Pydantic Settings.

镜像 server/src/config/env.ts 的 zod schema, 所有字段名/默认值/校验必须等价。

W0.3 安全审计 (2026-05-03) 重做: JWT_SECRET 必须 >=32 chars, 任何环境拒启。
原 Node 修复见 6fbdd41 + server/src/config/env.test.ts。

公共 fixture (`_clean_psynote_env`, `base_env`) 来自 tests/conftest.py。
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

# ─── 必填项 ────────────────────────────────────────────────────────


def test_valid_minimal_env(base_env: pytest.MonkeyPatch) -> None:
    """提供 DATABASE_URL + JWT_SECRET (>=32 chars) 即可构造 Settings"""
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.DATABASE_URL == "postgresql://u:p@localhost/db_test"
    assert settings.JWT_SECRET == "x" * 32


def test_missing_database_url_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "a" * 32)
    from app.core.config import Settings

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "DATABASE_URL" in str(exc.value)


def test_missing_jwt_secret_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    from app.core.config import Settings

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "JWT_SECRET" in str(exc.value)


# ─── W0.3 安全修复 重做: JWT_SECRET >=32 chars ────────────────────


def test_jwt_secret_below_32_chars_rejected(
    base_env: pytest.MonkeyPatch,
) -> None:
    """W0.3: 31 chars 必须 reject (Node 端原 fix 见 6fbdd41)"""
    base_env.setenv("JWT_SECRET", "a" * 31)  # 覆盖 base_env 的有效值
    from app.core.config import Settings

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    err = str(exc.value)
    assert "JWT_SECRET" in err
    assert "32" in err or "at least" in err.lower()


def test_jwt_secret_exactly_32_chars_accepted(
    base_env: pytest.MonkeyPatch,
) -> None:
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert len(settings.JWT_SECRET) == 32


def test_jwt_secret_long_value_accepted(
    base_env: pytest.MonkeyPatch,
) -> None:
    """生产建议 64+ chars (crypto.randomBytes(32).toString('hex'))"""
    base_env.setenv("JWT_SECRET", "x" * 128)
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert len(settings.JWT_SECRET) == 128


# ─── 默认值 (镜像 env.ts) ────────────────────────────────────────


def test_defaults_match_node_env_ts(base_env: pytest.MonkeyPatch) -> None:
    """env.ts 的 default 值必须 1:1 镜像"""
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.REDIS_URL == "redis://localhost:6379"
    assert settings.AI_BASE_URL == "https://api.openai.com/v1"
    assert settings.AI_MODEL == "gpt-4o"
    assert settings.PORT == 4000
    assert settings.HOST == "0.0.0.0"
    assert settings.NODE_ENV == "development"
    assert settings.CLIENT_URL == "http://localhost:5173"
    assert settings.SMTP_PORT == 587


# ─── NODE_ENV enum ───────────────────────────────────────────────


def test_node_env_enum_accepts_valid(base_env: pytest.MonkeyPatch) -> None:
    """env.ts: z.enum(['development', 'production', 'test'])"""
    from app.core.config import Settings

    for valid in ("development", "production", "test"):
        base_env.setenv("NODE_ENV", valid)
        settings = Settings(_env_file=None)
        assert valid == settings.NODE_ENV


def test_node_env_enum_rejects_invalid(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "staging")
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


# ─── 类型强制转换 (zod 用 z.coerce.number, Pydantic 用 int 自动转) ──


def test_port_coerced_from_string(base_env: pytest.MonkeyPatch) -> None:
    """env vars 都是 str, PORT 必须自动转 int"""
    base_env.setenv("PORT", "8001")
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.PORT == 8001
    assert isinstance(settings.PORT, int)


def test_smtp_port_coerced_from_string(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("SMTP_PORT", "465")
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.SMTP_PORT == 465


# ─── 可选字段 ─────────────────────────────────────────────────────


def test_optional_fields_default_none(base_env: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.AI_API_KEY is None
    assert settings.PUBLIC_BASE_URL is None
    assert settings.SMTP_HOST is None
    assert settings.SMTP_USER is None
    assert settings.SMTP_PASS is None
    assert settings.SMTP_FROM is None


def test_optional_fields_set_when_provided(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("AI_API_KEY", "sk-test-123")
    base_env.setenv("SMTP_HOST", "smtp.example.com")
    base_env.setenv("SMTP_USER", "noreply@example.com")
    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.AI_API_KEY == "sk-test-123"
    assert settings.SMTP_HOST == "smtp.example.com"
    assert settings.SMTP_USER == "noreply@example.com"


# ─── get_settings() 缓存 ─────────────────────────────────────────


def test_get_settings_returns_singleton(base_env: pytest.MonkeyPatch) -> None:
    """get_settings() 用 lru_cache, 多次调用返回同一实例"""
    # cache_clear() 已由 conftest 的 _clean_psynote_env autouse 处理
    from app.core.config import get_settings

    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
