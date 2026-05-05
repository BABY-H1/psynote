"""
Admin API 测试共享 fixture (Phase 3 Tier 4).

镜像 ``tests/api/v1/org/conftest.py`` 风格, 但 admin 模块不需要 OrgContext
(全部 sysadm 守门, 路径不含 ``{org_id}`` path param 触发 ``get_org_context``
中间件). 所以只用:

  - ``mock_db``: AsyncMock + sync ``add`` + ``flush``.
  - ``setup_db_results``: FIFO ``execute`` 返回 (与 org/auth/upload 同).
  - ``client``: 默认无认证 — 用于 401 测试.
  - ``authed_client``: 注入 fake non-sysadm user. 用于 403 测试 (sysadm 守门).
  - ``sysadm_client``: 注入 fake sysadm user. 用于 happy path.

工厂 helper:
  - ``make_org`` / ``make_user`` / ``make_member`` 与 org conftest 风格一致.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _admin_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_admin_routes_registered = False


def _ensure_admin_routes_registered() -> None:
    """一次性注册 admin router 到 ``app.main.app`` (test session 范围).

    Phase 3 Tier 4: ``app/main.py`` 的 admin router 注册由用户后续统一接入,
    测试 fixture 提前挂上让端点可达. 单次幂等 — FastAPI app 是 module 级单例,
    多次 ``include_router`` 会重复挂同样 path → 用 module-level flag 守门.
    """
    global _admin_routes_registered
    if _admin_routes_registered:
        return

    from app.api.v1.admin import (
        dashboard_router,
        library_router,
        license_router,
        tenant_router,
    )
    from app.api.v1.admin import router as core_router
    from app.main import app

    app.include_router(core_router, prefix="/api/admin", tags=["admin"])
    app.include_router(dashboard_router, prefix="/api/admin/dashboard", tags=["admin-dashboard"])
    app.include_router(library_router, prefix="/api/admin/library", tags=["admin-library"])
    app.include_router(license_router, prefix="/api/admin/licenses", tags=["admin-license"])
    app.include_router(tenant_router, prefix="/api/admin/tenants", tags=["admin-tenant"])

    _admin_routes_registered = True


@pytest.fixture(autouse=True)
def _register_admin_routers() -> None:
    _ensure_admin_routes_registered()


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result.

    与 org/conftest._make_query_result 同实现.
    """
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.scalar = MagicMock(return_value=row)
    result.first = MagicMock(return_value=row)
    if isinstance(row, list):
        result.all = MagicMock(return_value=row)
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=row)
        result.scalars = MagicMock(return_value=scalars)
    else:
        result.all = MagicMock(return_value=[row] if row is not None else [])
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=[row] if row is not None else [])
        result.scalars = MagicMock(return_value=scalars)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


# ─── TestClient fixtures ────────────────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """无认证 TestClient — 401 测试."""
    from app.core.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def authed_client(client: TestClient) -> Iterator[TestClient]:
    """非 sysadm 已认证 — 用于 403 测试."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="user@example.com",
        is_system_admin=False,
    )
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def sysadm_client(client: TestClient) -> Iterator[TestClient]:
    """system admin 已认证 — happy path."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="sysadm@example.com",
        is_system_admin=True,
    )
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# ─── 工厂 helper: 构造 ORM 实例 (无副作用) ──────────────────────


def _make_org(
    *,
    org_id: uuid.UUID | None = None,
    name: str = "Test Org",
    slug: str = "test-org",
    plan: str = "free",
    settings: dict[str, Any] | None = None,
    triage_config: dict[str, Any] | None = None,
    license_key: str | None = None,
) -> Any:
    from app.db.models.organizations import Organization

    o = Organization()
    o.id = org_id or uuid.UUID(_FAKE_ORG_ID)
    o.name = name
    o.slug = slug
    o.plan = plan
    o.license_key = license_key
    o.settings = settings or {}
    o.triage_config = triage_config or {}
    o.data_retention_policy = None
    o.parent_org_id = None
    o.org_level = "leaf"
    return o


def _make_user(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "User",
    is_system_admin: bool = False,
    password_hash: str | None = "$2b$10$placeholder",
) -> Any:
    from app.db.models.users import User

    u = User()
    u.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    u.email = email
    u.name = name
    u.password_hash = password_hash
    u.avatar_url = None
    u.is_system_admin = is_system_admin
    u.is_guardian_account = False
    u.last_login_at = None
    return u


def _make_member(
    *,
    member_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    role: str = "counselor",
    status: str = "active",
    role_v2: str | None = None,
    access_profile: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.org_members import OrgMember

    m = OrgMember()
    m.id = member_id or uuid.UUID("00000000-0000-0000-0000-000000000050")
    m.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    m.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    m.role = role
    m.role_v2 = role_v2
    m.principal_class = None
    m.access_profile = access_profile
    m.permissions = {}
    m.status = status
    m.valid_until = None
    m.supervisor_id = None
    m.full_practice_access = False
    m.source_partnership_id = None
    m.certifications = []
    m.specialties = []
    m.max_caseload = None
    m.bio = None
    return m


@pytest.fixture
def make_org() -> Any:
    return _make_org


@pytest.fixture
def make_user() -> Any:
    return _make_user


@pytest.fixture
def make_member() -> Any:
    return _make_member
