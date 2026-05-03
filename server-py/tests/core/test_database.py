"""
Tests for app/core/database.py — async SQLAlchemy engine + session factory。

Phase 0 仅校验:
  - engine 是 AsyncEngine 实例
  - URL 从 settings.DATABASE_URL 读取
  - postgresql:// 自动转 postgresql+asyncpg:// (asyncpg driver)
  - async_session_maker 产出 AsyncSession
  - get_db() 是 async generator (FastAPI Depends 兼容)

Phase 2 起会加: Base declarative + 75 表模型 + 集成测试 (用 dev DB)。

注: 这里不跑实际 DB 连接 — SQLAlchemy async engine 是 lazy connect, 构造
不会真连。集成测试在 tests/integration/ (Phase 2 起加)。

公共 fixture (`_clean_psynote_env`, `base_env`) 来自 tests/conftest.py。
"""

from __future__ import annotations

import inspect

import pytest


@pytest.fixture(autouse=True)
def _ensure_valid_env(base_env: pytest.MonkeyPatch) -> None:
    """本文件所有测试 import app.core.database 时都需要可构造 Settings。"""
    return None


# ─── engine ──────────────────────────────────────────────────────


def test_engine_is_async() -> None:
    from sqlalchemy.ext.asyncio import AsyncEngine

    from app.core.database import engine

    assert isinstance(engine, AsyncEngine)


def test_engine_uses_asyncpg_driver() -> None:
    """postgresql:// 必须转换成 postgresql+asyncpg:// — 否则会用同步 driver"""
    from app.core.database import engine

    # SQLAlchemy URL 暴露 driver 信息
    assert engine.url.drivername == "postgresql+asyncpg"


def test_engine_url_from_settings() -> None:
    from app.core.database import engine

    assert engine.url.database == "db_test"
    assert engine.url.host == "localhost"


# ─── session_maker ───────────────────────────────────────────────


def test_async_session_maker_exists() -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.core.database import async_session_maker

    assert isinstance(async_session_maker, async_sessionmaker)


# ─── get_db dependency ───────────────────────────────────────────


def test_get_db_is_async_generator() -> None:
    """FastAPI Depends 期望 async generator (yield 一次再 close)"""
    from app.core.database import get_db

    assert inspect.isasyncgenfunction(get_db)


@pytest.mark.asyncio
async def test_get_db_yields_session() -> None:
    """yield 出来的应该是 AsyncSession 实例"""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.database import get_db

    gen = get_db()
    session = await anext(gen)
    assert isinstance(session, AsyncSession)
    # 清理: 模拟 FastAPI 在请求结束后调用 generator close
    await gen.aclose()


# ─── Base declarative ────────────────────────────────────────────


def test_base_is_declarative() -> None:
    """Base 是 SQLAlchemy 2.0 DeclarativeBase, Phase 2 给 75 表用。"""
    from sqlalchemy.orm import DeclarativeBase

    from app.core.database import Base

    assert issubclass(Base, DeclarativeBase)


# ─── 工具函数 ─────────────────────────────────────────────────────


def test_normalize_postgres_url_handles_psycopg() -> None:
    """旧 Node .env 可能写 postgres:// 或 postgresql://, 必须统一到 asyncpg"""
    from app.core.database import _normalize_async_url

    assert _normalize_async_url("postgresql://u:p@h/d") == "postgresql+asyncpg://u:p@h/d"
    assert _normalize_async_url("postgres://u:p@h/d") == "postgresql+asyncpg://u:p@h/d"
    # 已经带 +asyncpg 的不重复加
    assert _normalize_async_url("postgresql+asyncpg://u:p@h/d") == "postgresql+asyncpg://u:p@h/d"
