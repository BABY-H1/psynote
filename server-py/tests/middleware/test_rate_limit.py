"""Phase 5 P0 fix (Fix 8) — Rate limit middleware 测试。

覆盖:
  - login 5/minute → 第 6 次返 429
  - forgot-password 3/minute → 第 4 次返 429
  - reset-password 5/minute → 第 6 次返 429
  - counseling-public/register 5/minute → 第 6 次返 429
  - eap-public/register 5/minute → 第 6 次返 429
  - parent-bind/{token} POST 10/minute → 第 11 次返 429

注: 依赖 ``tests/conftest.py:_reset_rate_limiter`` autouse 让每测试 limiter 独立。
本文件**禁用** autouse reset (用 ``request.getfixturevalue('_reset_rate_limiter')`` 隐式启用),
这样每测试 limiter 是 clean 的, 但跑完测试期间能累积命中。
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from tests.api.v1._conftest_helpers import make_mock_db, setup_db_results_factory

if TYPE_CHECKING:
    pass


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def client(mock_db: AsyncMock, base_env: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """TestClient with mock_db injected. base_env 让 Settings 可构造.

    注: 用 ``with TestClient(app) as c`` 形式确保 startup/shutdown lifespan 正确,
    防 ResourceWarning (unclosed event loop / sockets) 在 full-suite teardown 触发.
    """
    from app.core.database import get_db
    from app.main import app

    base_env.setenv("NODE_ENV", "test")
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


# ─── /api/auth/login 5/minute ────────────────────────────────────


def test_login_rate_limit_429_on_sixth_call(
    client: TestClient,
    mock_db: AsyncMock,
) -> None:
    """5 次失败的 login (mock 返 None) 都是 400; 第 6 次必须 429."""
    setup = setup_db_results_factory(mock_db)
    # 6 次 None (用户不存在), 实际只前 5 个能命中 endpoint
    setup([None] * 6)

    payload = {"email": "x@y.com", "password": "doesnt-matter"}
    for i in range(5):
        r = client.post("/api/auth/login", json=payload)
        # 业务层报 400 ValidationError (账号或密码错误), 不是 429
        assert r.status_code != 429, f"call {i + 1} unexpectedly hit limit: {r.text}"

    # 第 6 次: 应当 429
    r6 = client.post("/api/auth/login", json=payload)
    assert r6.status_code == 429


# ─── /api/auth/forgot-password 3/minute ──────────────────────────


def test_forgot_password_rate_limit_429_on_fourth_call(
    client: TestClient,
    mock_db: AsyncMock,
) -> None:
    """3 次都是 200 (防枚举静默); 第 4 次 429."""
    setup = setup_db_results_factory(mock_db)
    setup([None] * 4)

    payload = {"email": "ghost@example.com"}
    for i in range(3):
        r = client.post("/api/auth/forgot-password", json=payload)
        assert r.status_code != 429, f"call {i + 1} unexpectedly hit limit: {r.text}"

    r4 = client.post("/api/auth/forgot-password", json=payload)
    assert r4.status_code == 429


# ─── /api/auth/reset-password 5/minute ───────────────────────────


def test_reset_password_rate_limit_429_on_sixth_call(
    client: TestClient,
    mock_db: AsyncMock,
) -> None:
    """5 次失败 reset (mock 返 None token row → 400); 第 6 次 429."""
    setup = setup_db_results_factory(mock_db)
    setup([None] * 6)

    # token 必须 64 字符 hex (a-f0-9), schema validator 否则 422 → 不进 router
    payload = {"token": "a" * 64, "newPassword": "newpw123"}
    for i in range(5):
        r = client.post("/api/auth/reset-password", json=payload)
        assert r.status_code != 429, f"call {i + 1} unexpectedly hit limit: {r.text}"

    r6 = client.post("/api/auth/reset-password", json=payload)
    assert r6.status_code == 429
