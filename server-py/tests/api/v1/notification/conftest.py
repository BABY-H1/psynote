"""
Notification API 测试共享 fixture (复用 content_block 的 dependency override
pattern, 包括 _reject_client / _require_org_admin 等 role guard)。
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _notification_test_env(base_env: pytest.MonkeyPatch) -> None:
    """让 ``Settings()`` 可构造 + NODE_ENV='test' (与 auth conftest 同 pattern)。"""
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """Mock SQLAlchemy ``Result``: 同时支持 scalar_one_or_none / scalars().all() / scalar_one。"""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    rows: list[Any] = list(row) if isinstance(row, list) else [row] if row is not None else []
    scalars_obj = MagicMock()
    scalars_obj.all = MagicMock(return_value=rows)
    result.scalars = MagicMock(return_value=scalars_obj)
    result.first = MagicMock(return_value=row)
    result.scalar_one = MagicMock(return_value=row if isinstance(row, int) else 0)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
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
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


def _override_db_dep(app: Any, mock_db: AsyncMock) -> None:
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: mock_db


def _make_org_ctx(role: str = "org_admin") -> Any:
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


def _make_auth_user() -> Any:
    from app.middleware.auth import AuthUser

    return AuthUser(
        id=FAKE_USER_ID,
        email="staff@example.com",
        is_system_admin=False,
    )


@pytest.fixture
def admin_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """Org admin TestClient。"""
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
def counselor_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """Counselor TestClient — 用于测 reminder-settings PUT 拦截。"""
    from app.main import app
    from app.middleware.auth import get_current_user
    from app.middleware.org_context import get_org_context

    _override_db_dep(app, mock_db)
    app.dependency_overrides[get_current_user] = lambda: _make_auth_user()
    app.dependency_overrides[get_org_context] = lambda: _make_org_ctx("counselor")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client_role_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """Role='client' TestClient — 用于测 _reject_client 拦截。"""
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
def public_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """无 auth 的 TestClient — 用于 /api/public/appointments confirm/cancel。"""
    from app.main import app

    _override_db_dep(app, mock_db)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_org_id() -> str:
    return FAKE_ORG_ID
