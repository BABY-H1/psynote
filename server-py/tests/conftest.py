"""
Shared pytest fixtures for server-py/.

放在 conftest.py 让 pytest 自动发现, 所有子目录测试共享。Phase 1+ 加
新测试不必再各自定义 env-cleanup boilerplate。

设计原则:
  - autouse `_clean_psynote_env`: 每个测试开始时清空 psynote 相关 env
    + 清 Settings lru_cache, 测试自己声明需要的 env (防止本地 .env
    污染或前一个测试遗留 monkeypatch)。
  - `base_env` (非 autouse): 提供最小有效 env (DATABASE_URL + JWT_SECRET)
    让 Settings() 能构造。需要的测试显式 request 此 fixture。

变量列表通过 `Settings.model_fields.keys()` 派生 — 加新字段时不必改这里,
防止 _PSYNOTE_ENV_VARS 与 Settings schema drift。
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def _clean_psynote_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """每个测试启动: 清 psynote env vars + 清 Settings 缓存。"""
    # 延迟 import: Settings 类自身不读 env (只在 instantiate 时读),
    # 所以这里 import 不会触发任何校验副作用。
    from app.core.config import Settings, get_settings

    for var in Settings.model_fields:
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    yield
    # teardown 不需要再 clear (monkeypatch 会自动还原 env)。


@pytest.fixture
def base_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """
    最小有效 env (DATABASE_URL + JWT_SECRET >=32 chars), 让 Settings() 能构造。

    测试自由覆盖任意字段:
        def test_x(base_env):
            base_env.setenv("NODE_ENV", "production")
            ...

    返回的就是 monkeypatch (方便链式 setenv), 与原 monkeypatch fixture 等价。
    """
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db_test")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    return monkeypatch
