"""
Content block API 测试共享 fixture。

特殊点 (相对 auth conftest):
  - 路由用 ``get_org_context``, 我们用 dependency_overrides 注入一个固定 OrgContext
    跳过 DB 查询 (与 upload conftest 同 pattern)。
  - 提供两个变体: ``staff_client`` (org_admin) 和 ``client_client`` (role='client',
    用于 visibility 过滤测试)。
  - ``mock_db`` 与 auth conftest 同 pattern (AsyncMock + setup_db_results helper)。
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    """``setup_db_results`` fixture 形状: 接受 row 列表, 配 mock_db.execute FIFO。"""

    def __call__(self, rows: list[Any]) -> None: ...


# 与 fixtures 注入 OrgContext 的 org_id 保持一致
FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _content_block_test_env(base_env: pytest.MonkeyPatch) -> None:
    """让 ``Settings()`` 可构造 + 把 NODE_ENV pin 成 test (与 auth conftest 一致)。"""
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造一个 mock SQLAlchemy ``Result``: ``.scalar_one_or_none()`` /
    ``.scalars().all()`` / ``.first()`` / ``.scalar_one()`` 都返 row 或对应集合。

    这样无论 router 用哪种 read 风格 (单行 / 列表 / count) 都能 dispatch。
    """
    result = MagicMock()
    # 单行: 返 row 本身 (None 也合法)
    result.scalar_one_or_none = MagicMock(return_value=row)
    # row 集合: 自动按 list / 单值 broadcast
    rows: list[Any] = list(row) if isinstance(row, list) else [row] if row is not None else []
    scalars_obj = MagicMock()
    scalars_obj.all = MagicMock(return_value=rows)
    result.scalars = MagicMock(return_value=scalars_obj)
    # join 查 .first() (返 (orm, org_id) tuple 或 None)
    result.first = MagicMock(return_value=row)
    # count
    result.scalar_one = MagicMock(return_value=row if isinstance(row, int) else 0)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
    """模拟 AsyncSession (与 auth conftest 同结构)。"""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.execute = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    """``setup_db_results([row1, row2, None])`` → mock_db.execute FIFO side_effect。"""

    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


def _override_db_dep(app: Any, mock_db: AsyncMock) -> None:
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: mock_db


def _make_org_ctx(role: str = "org_admin") -> Any:
    """构造测试用 OrgContext (counseling)。role 决定下游 client filter / role guard。"""
    from app.middleware.org_context import LicenseInfo, OrgContext

    role_v2_map = {
        "org_admin": "clinic_admin",
        "counselor": "counselor",
        "client": "client",
    }
    return OrgContext(
        org_id=FAKE_ORG_ID,
        org_type="counseling",
        role=role,  # type: ignore[arg-type]
        role_v2=role_v2_map.get(role, "client"),  # type: ignore[arg-type]
        member_id=f"member-{role}",
        full_practice_access=(role == "org_admin"),
        tier="starter",
        license=LicenseInfo(status="none"),
    )


def _make_auth_user(*, is_sysadm: bool = False) -> Any:
    from app.middleware.auth import AuthUser

    return AuthUser(
        id=FAKE_USER_ID,
        email="staff@example.com",
        is_system_admin=is_sysadm,
    )


@pytest.fixture
def staff_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """已认证 + org_admin 的 TestClient。"""
    from app.main import app
    from app.middleware.auth import get_current_user
    from app.middleware.org_context import get_org_context

    _override_db_dep(app, mock_db)
    app.dependency_overrides[get_current_user] = lambda: _make_auth_user()
    app.dependency_overrides[get_org_context] = lambda: _make_org_ctx("org_admin")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client_role_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """已认证 + role='client' (用于 visibility 过滤测试)。"""
    from app.main import app
    from app.middleware.auth import get_current_user
    from app.middleware.org_context import get_org_context

    _override_db_dep(app, mock_db)
    app.dependency_overrides[get_current_user] = lambda: _make_auth_user()
    app.dependency_overrides[get_org_context] = lambda: _make_org_ctx("client")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_org_id() -> str:
    return FAKE_ORG_ID


@pytest.fixture
def fake_user_id() -> str:
    return FAKE_USER_ID
