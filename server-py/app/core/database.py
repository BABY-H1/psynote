"""
Async SQLAlchemy 引擎 + session 工厂。

Phase 0 阶段只暴露:
  - engine:               AsyncEngine (lazy connect, 构造时不真连)
  - async_session_maker:  async_sessionmaker[AsyncSession]
  - get_db:               FastAPI Dependency (async generator)
  - Base:                 DeclarativeBase 基类 (Phase 2 给 75 表继承)

不在此处定义任何 ORM 模型 — 那是 Phase 2 的工作 (app/db/models/*.py)。

URL 兼容: Node 端 .env 写的是 `postgresql://...` (drizzle-orm 的 postgres
driver), Python asyncpg 需要 `postgresql+asyncpg://...`。`_normalize_async_url`
统一转。也支持 Heroku 风格的 `postgres://` 简写, 防 .env 共享时踩坑。
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


def _normalize_async_url(url: str) -> str:
    """
    将 Node 端常见的 postgres:// / postgresql:// URL 统一转 asyncpg driver。

    SQLAlchemy 默认 postgresql:// driver 是同步 psycopg2, 我们走 async,
    必须显式 +asyncpg。否则启动时会报 "InvalidRequestError: The asyncio
    extension requires an async driver".
    """
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        # Heroku 风格简写, 部分 .env 模板也用
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


class Base(DeclarativeBase):
    """所有 ORM 模型的根。Phase 2 起 75 表 (users / organizations / ...) 继承此类。"""


def _create_engine() -> AsyncEngine:
    settings = get_settings()
    url = _normalize_async_url(settings.DATABASE_URL)
    return create_async_engine(
        url,
        # SQL 日志 — Phase 1 起按 NODE_ENV 开关 (development → True)。
        echo=False,
        # Pool 在长连接被防火墙/网关静默断开后, 下次取连接前先 ping 一下,
        # 失败则丢弃 + 重建。production 部署在云上几乎必备。
        pool_pre_ping=True,
        # SQLAlchemy 2.0 行为(默认 True, 写出来明确意图)
        future=True,
    )


engine: AsyncEngine = _create_engine()

async_session_maker: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    # 提交后保留对象状态 — FastAPI 路由 commit 后还要把对象 jsonify 出去,
    # 默认 expire_on_commit=True 会在 jsonify 时触发再次查询, 性能差。
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI Dependency — 每个请求一个 session, 请求结束自动 close。

    用法::

        from fastapi import Depends
        from sqlalchemy.ext.asyncio import AsyncSession

        @router.get("/")
        async def handler(db: AsyncSession = Depends(get_db)):
            result = await db.execute(...)
            return result.scalars().all()

    异常处理: 在路由内抛出, 由 middleware/error_handler.py 统一捕获 +
    转 HTTPException。session 的 rollback 由 async with 上下文管理器保证。
    """
    async with async_session_maker() as session:
        yield session
