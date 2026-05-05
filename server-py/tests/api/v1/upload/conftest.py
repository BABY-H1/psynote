"""
Upload API 测试共享 fixture。

特殊点 (相对 user/auth conftest):
  - upload 路由依赖 ``get_org_context``, 我们用 dependency_overrides 注入一个固定
    OrgContext (counseling 类型, org_admin role) 跳过 DB 查询。
  - autouse ``_upload_dir_tmp``: 把 ``UPLOAD_DIR`` env 指到 ``tmp_path`` 让测试落盘
    隔离 + 不污染 ``D:/dev-cache``; pytest 走完自动清。
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _upload_test_env(
    base_env: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """让 ``Settings()`` 可构造 + ``UPLOAD_DIR`` 指到 tmp 目录隔离落盘。"""
    base_env.setenv("NODE_ENV", "test")
    base_env.setenv("UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def upload_dir(tmp_path: Path) -> Path:
    """暴露 tmp upload root 给测试 assert 文件已写。"""
    return tmp_path


@pytest.fixture
def authed_org_client() -> Iterator[TestClient]:
    """
    已认证 + 已 resolve OrgContext 的 TestClient。

    upload 路由只用 ``org.org_id`` 拼盘路径, 不读其他字段; 注入最简化 OrgContext
    即可跑通; 真实 RBAC 决策由 ``test_org_context.py`` 等中间件级测试覆盖。
    """
    import uuid

    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import LicenseInfo, OrgContext, get_org_context

    fake_user = AuthUser(
        id="00000000-0000-0000-0000-000000000001",
        email="staff@example.com",
        is_system_admin=False,
    )
    fake_org_id = str(uuid.UUID("00000000-0000-0000-0000-000000000099"))
    fake_org = OrgContext(
        org_id=fake_org_id,
        org_type="counseling",
        role="org_admin",
        role_v2="clinic_admin",
        member_id="member-x",
        full_practice_access=True,
        tier="starter",
        license=LicenseInfo(status="none"),
    )

    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_org_context] = lambda: fake_org
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_org_id() -> str:
    """与 ``authed_org_client`` 注入的 org_id 一致, 测试 assert 落盘路径用。"""
    return "00000000-0000-0000-0000-000000000099"


@pytest.fixture
def unauthed_client() -> Iterator[TestClient]:
    """无 dependency override — 用于验证 401 路径。"""
    from app.main import app

    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()
