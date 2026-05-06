"""
Alembic environment — async SQLAlchemy + Pydantic Settings + 75 张模型自动 register。

设计:
  - **DB URL 从 ``app.core.config.Settings`` 读** (.env / env vars), 不从 alembic.ini
    硬编码, 避免密码泄露
  - **import 全部 models** 让 Base.metadata 知道 75+1 张表 (autogenerate 用)
  - **支持 async** — engine 创建走 ``create_async_engine``, run_migrations 在 sync
    上下文内 (alembic 强制), 用 ``connection.run_sync`` 桥接

部署用法:
  - **首次基线化** (Phase 2 切流时, 一次性):
      ``alembic stamp 0000_baseline``
    把 dev DB 当作 Drizzle 26 个 migration 已跑完的状态, 不重做。
  - **应用新 migration**:
      ``alembic upgrade head``
  - **生成新 migration** (改了模型后):
      ``alembic revision --autogenerate -m "<slug>"``
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# 关键: import 此前所有 75+1 张模型, 让 Base.metadata 知道全部表
import app.db.models  # noqa: F401 — side-effect import
from alembic import context
from app.core.config import get_settings
from app.core.database import Base, _normalize_async_url

# Alembic Config 对象
config = context.config

# Logging 配置
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject DATABASE_URL from Settings (replaces empty alembic.ini value)
_settings = get_settings()
config.set_main_option("sqlalchemy.url", _normalize_async_url(_settings.DATABASE_URL))

# autogenerate 用的 target metadata
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generate SQL script without DB connection.

    用法: ``alembic upgrade head --sql`` 输出 SQL 到 stdout。
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # 比较类型变化 (e.g. text → varchar) 防止漂移漏检
        compare_type=True,
        # 比较 server_default 字符串
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Sync inner runner — alembic 不支持纯 async, 用 connection.run_sync 桥接。"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode — production path。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """启动 async runner (alembic CLI 进入此 path)。"""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
