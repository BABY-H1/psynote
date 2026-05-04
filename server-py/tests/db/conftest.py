"""
DB 模型测试共享 fixture。

模型文件 ``from app.core.database import Base`` 会触发 ``app.core.database``
module-load, 而 module 顶层 eager 创建 engine → 调 ``get_settings()`` → 缺
DATABASE_URL/JWT_SECRET 时 SystemExit。

此处 autouse ``base_env``, 让所有 tests/db/ 测试启动前先注入最小 env, 模型
inline import 时不会被 Settings 校验击穿。

测试本身不连真实 DB (仅查模型形态), 给的是占位 URL, 不会真发起连接。
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _db_test_env(base_env: pytest.MonkeyPatch) -> None:
    """让根 conftest 的 base_env 在 tests/db/ 下自动生效。"""
    return None
