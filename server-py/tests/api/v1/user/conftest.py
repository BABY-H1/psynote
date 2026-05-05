"""
User API 测试共享 fixture。

复用 auth conftest 的 ``mock_db`` / ``setup_db_results`` / ``client`` /
``authed_client`` pattern (FastAPI ``dependency_overrides`` + AsyncMock 模拟
``AsyncSession``)。

为啥不直接 import auth conftest: pytest fixture 走收集机制, 子目录 conftest
是隔离的; 测试边界更清晰也方便 user 模块单独跑 (``pytest tests/api/v1/user/``)。
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    """``setup_db_results`` fixture 形状: 接受 row 列表, 配 ``mock_db.execute`` FIFO。"""

    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _user_test_env(base_env: pytest.MonkeyPatch) -> None:
    """让 ``Settings()`` 能构造 + 与 auth 测试共享同 NODE_ENV='test'。"""
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy ``Result`` — ``.scalar_one_or_none()`` / ``.first()`` 都返 row。

    GET /me 同时用了 scalar_one_or_none (取 user) + first (取 member row + org_name);
    一个 mock 同时支持两形态, 测试 setup 不需要分情形。
    """
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.first = MagicMock(return_value=row)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
    """模拟 ``AsyncSession`` (与 auth conftest 同 pattern)。"""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    """``setup_db_results([row1, row2])`` → mock_db.execute FIFO side_effect。"""

    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


@pytest.fixture
def client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """TestClient + ``get_db`` override 注入 mock_db; teardown 清 overrides。"""
    from app.core.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def authed_client(client: TestClient) -> Iterator[TestClient]:
    """已认证 TestClient — ``get_current_user`` override 成虚拟 AuthUser。"""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user

    fake_user = AuthUser(
        id="00000000-0000-0000-0000-000000000001",
        email="authed@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)
