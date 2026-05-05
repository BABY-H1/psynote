"""
Auth API 测试共享 fixture。

镜像 server/src/modules/auth/{auth,password-reset}.routes.test.ts 的测试 setup,
但用 pytest fixture + FastAPI dependency_overrides 取代 vitest 的 vi.mock。

设计要点:
  - autouse `_auth_test_env`: 复用根 conftest 的 base_env, 让 ``app.main`` import 时
    Settings() 能构造 (DATABASE_URL + JWT_SECRET) — model 文件 inline import 同理。
  - `mock_db`: AsyncMock 模拟 AsyncSession, 通过 dependency_overrides[get_db] 注入。
  - `setup_db_results`: FIFO helper, 一次声明多次 ``db.execute(...)`` 的返回值,
    与 Node 端 ``dbResults.push(...)`` 用法对应。
  - `client`: TestClient + dependency override 注入 mock_db, teardown 清空 overrides。
  - `authed_client`: 在 client 基础上再 override get_current_user, 给 change-password
    类已认证测试用。
  - `captured_emails`: monkeypatch ``send_password_reset_email`` 捕获发件参数, 镜像
    Node 端 ``sentEmails.push({...})``。
"""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from tests.api.v1._conftest_helpers import (
    SetupDbResults,
    make_mock_db,
    setup_db_results_factory,
)


@pytest.fixture(autouse=True)
def _auth_test_env(base_env: pytest.MonkeyPatch) -> None:
    """所有 auth 测试需要 Settings 可构造 (app.main / model imports 触发)。

    设 ``NODE_ENV=test`` 与 ``tests/test_main.py`` 的 autouse 一致 — ``app.main:app``
    是 module-level 单例, ``health()`` 闭包捕获 settings.NODE_ENV; 第一次 import
    决定了之后所有 client 看到的 environment 字段。让 auth 测试 import 时也是 'test',
    避免跨测试文件 run 时 (``pytest tests/api/ tests/test_main.py``) 顺序污染。
    """
    base_env.setenv("NODE_ENV", "test")


@pytest.fixture
def mock_db() -> AsyncMock:
    """
    模拟 ``AsyncSession``。默认行为:
      - ``execute`` AsyncMock, 测试 setup 后再用 ``setup_db_results`` 配 side_effect
      - ``commit`` AsyncMock, 默认 await 即返
      - ``add`` MagicMock (sync), 让 router 的 ``db.add(token_row)`` 不抛
      - ``rollback`` AsyncMock (异常路径以防万一)

    单测里直接 ``mock_db.execute.assert_called_*`` 检查 SQL 调用次数。
    """
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    """
    helper: ``setup_db_results([row1, row2, None])`` → mock_db.execute FIFO side_effect。

    每次 ``await db.execute(...)`` 拿下一个 row, 自动包成 mock Result。Row 可以是
    任意 ORM 对象 / None。镜像 Node 端 ``dbResults.push([...])`` 的 FIFO 行为。
    """
    return setup_db_results_factory(mock_db)


@pytest.fixture
def client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """
    TestClient over the real ``app.main:app``, 但 ``get_db`` 注入 mock_db。

    autouse env + 注入完成后再 import app, 让 model 加载时拿到合法 Settings。
    teardown 清空 dependency_overrides 防跨测试污染。
    """
    from app.core.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def authed_client(client: TestClient) -> Iterator[TestClient]:
    """已认证 TestClient — change-password 等需要 ``get_current_user`` 的端点用。

    用 ``app.dependency_overrides[get_current_user]`` 注入一个虚拟 AuthUser, 不依赖
    真实 token verify (那部分已在 tests/middleware/test_auth.py 覆盖)。
    """
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
        # client fixture 的 finally 会再 clear, 这里也 pop 掉 (防 yield 外 cleanup 顺序)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def captured_emails(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """
    捕获 ``send_password_reset_email(to, link)`` 调用。

    镜像 Node 端::

        const sentEmails: Array<{ to, resetLink }> = [];
        vi.mock('../../lib/mailer.js', () => ({ sendPasswordResetEmail: ... }));

    返回的 list 在测试里直接 assert 长度 / 内容。
    """
    sent: list[tuple[str, str]] = []

    async def _capture(to: str, reset_link: str) -> None:
        sent.append((to, reset_link))

    # router 是 ``from app.lib.mailer import send_password_reset_email`` 直接 import
    # 函数引用, 因此 patch 必须打在 router 模块的 namespace 上, 而非 mailer 模块。
    #
    # 注意 trick: ``app.api.v1.auth.__init__.py`` 暴露了 ``router`` (APIRouter 对象),
    # 这个名字 shadow 了同名子模块在父包的 attribute 视图。monkeypatch 的字符串
    # 解析走 getattr, 会拿到 APIRouter 而非 module。所以这里直接通过 import_module
    # 拿到 module 对象后用 setattr(obj, name, value) 形式打 patch。
    import importlib

    router_module = importlib.import_module("app.api.v1.auth.router")
    monkeypatch.setattr(router_module, "send_password_reset_email", _capture)
    return sent
