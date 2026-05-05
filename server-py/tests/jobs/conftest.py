"""
Celery jobs test fixtures — Phase 4。

设计:
  - autouse `_jobs_test_env` — 让 Settings 可构造 (与 auth/assessment 一致)
  - autouse `_celery_eager_mode` — 让任务同步执行 (无需 Redis worker)
  - `mock_db_session` — patch ``async_session_maker`` 让任务体内 ``async with`` 拿
    到 mock AsyncSession; 测试用 ``setup_db_results`` 配 FIFO execute 返回值。

注: jobs 不走 FastAPI Depends, 数据库 session 是任务内部 ``async_session_maker()`` 直接
构造. 所以 mock 走的是 module 级别 patch.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import asynccontextmanager
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _jobs_test_env(base_env: pytest.MonkeyPatch) -> Iterator[None]:
    """提供 Settings 必需的 env (DATABASE_URL + JWT_SECRET 来自 base_env, NODE_ENV 设
    为 test). 必须先运行, 让后续 ``_celery_eager_mode`` 在 import celery_app 时
    Settings() 能构造.
    """
    base_env.setenv("NODE_ENV", "test")
    yield


@pytest.fixture(autouse=True)
def _celery_eager_mode(_jobs_test_env: None) -> Iterator[None]:
    """让 Celery 任务同步跑 — 无需 Redis worker。

    依赖 ``_jobs_test_env`` 先跑, 保证 ``app.jobs.celery_app`` import 时
    ``get_settings()`` 拿到合法 env.

    每个测试 reset eager 配置防泄漏 (虽然 always_eager 通常一直 True 就行,
    但严谨 teardown).
    """
    from app.jobs.celery_app import celery_app, configure_test_mode

    configure_test_mode()
    assert celery_app.conf.task_always_eager is True
    yield


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result, 兼容 scalars/scalar_one_or_none."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    if isinstance(row, list):
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=row)
        result.scalars = MagicMock(return_value=scalars)
    else:
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=[row] if row is not None else [])
        result.scalars = MagicMock(return_value=scalars)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
    """模拟 AsyncSession (与 auth/assessment fixture 同形)."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


@pytest.fixture
def patch_session_maker(monkeypatch: pytest.MonkeyPatch, mock_db: AsyncMock) -> AsyncMock:
    """Patch ``async_session_maker`` 在三个 job 模块 namespace 上, 让任务体内
    ``async with async_session_maker() as db`` 拿到 ``mock_db``。

    返回 mock_db, 测试可直接 assert ``mock_db.execute.assert_called_*``.
    """

    @asynccontextmanager
    async def _fake_maker_ctx(*args: Any, **kwargs: Any):
        yield mock_db

    def _fake_maker_factory() -> Any:
        return _fake_maker_ctx()

    import importlib

    for mod_name in (
        "app.jobs.compliance",
        "app.jobs.reminders",
        "app.jobs.followup",
    ):
        mod = importlib.import_module(mod_name)
        monkeypatch.setattr(mod, "async_session_maker", _fake_maker_factory)

    return mock_db
