"""
Org API 测试共享 fixture。

镜像 ``tests/api/v1/auth/conftest.py`` + ``tests/api/v1/upload/conftest.py`` 的
混合 pattern: mock_db (AsyncSession) + setup_db_results FIFO + dependency_overrides
注入 OrgContext / DataScope.

设计要点:
  - autouse ``_org_test_env``: 与 auth 同, 设 NODE_ENV=test 让 Settings() 可构造.
  - ``mock_db``: AsyncMock + sync ``add`` + ``flush``.
  - ``setup_db_results``: FIFO ``execute`` 返回 (auth/conftest 同).
  - ``client``: 默认无认证 — 用于公开端点 (public-services).
  - ``authed_client``: 注入 fake AuthUser (非 sysadm). 用于一般已认证端点.
  - ``sysadm_client``: 注入 fake AuthUser (is_system_admin=True). 用于 POST /api/orgs/.
  - ``admin_org_client``: 注入 user + OrgContext (org_admin role). 走 RBAC 守门.
  - ``client_org_client``: 注入 user + OrgContext (legacy role 'client'). 用于
    rejectClient 路径测试.

Phase 3 注: data_scope override 暂未注入 — 本模块路由不直接消费 DataScope, 走
``get_org_context`` 即可. 后续 Phase 加 ``assert_authorized`` 时再补.
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
def _org_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result.

    支持:
      - ``scalar_one_or_none()`` 返回 row (None / single ORM object)
      - ``scalar()`` 返回 row (count(*) 用)
      - ``first()`` 返回 row 直接 (selecting 元组的场景)
      - ``all()`` 返回 list (row 是 list 时直接, 否则 [row] 包一下)
      - ``scalars().all()`` 返回 list
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
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


@pytest.fixture
def client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """无认证 TestClient — 用于公开端点 (public-services)."""
    from app.core.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# ─── 已认证 / Org Context fixtures ──────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def authed_client(client: TestClient) -> Iterator[TestClient]:
    """非 sysadm + 无 OrgContext (path 不含 {org_id}). 用于 GET /api/orgs/."""
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
    """system admin TestClient. 用于 POST /api/orgs/ (创建 org)."""
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


def _make_org_context(role: str = "org_admin", role_v2: str = "clinic_admin") -> Any:
    """构造一个 OrgContext (counseling, starter tier, no license)."""
    from app.middleware.org_context import LicenseInfo, OrgContext

    return OrgContext(
        org_id=_FAKE_ORG_ID,
        org_type="counseling",
        role=role,
        role_v2=role_v2,
        member_id="member-x",
        full_practice_access=(role == "org_admin"),
        tier="starter",
        license=LicenseInfo(status="none"),
    )


@pytest.fixture
def admin_org_client(client: TestClient) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin'). 用于走 RBAC 守门的端点."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="admin@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def counselor_org_client(client: TestClient) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='counselor'). 用于校验 admin-only 端点 403."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="counselor@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor"
    )
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def client_role_org_client(client: TestClient) -> Iterator[TestClient]:
    """已认证 + OrgContext(legacy role='client'). 用于 rejectClient 测试."""
    from app.main import app
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="client@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_org_context, None)


# ─── 工厂 helper: 构造 ORM 实例 (无副作用) ──────────────────


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


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "u@example.com",
    name: str = "User",
) -> Any:
    from app.db.models.users import User

    u = User()
    u.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    u.email = email
    u.name = name
    u.password_hash = None
    u.avatar_url = None
    u.is_system_admin = False
    return u


def _make_member(
    *,
    member_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    role: str = "counselor",
    status: str = "active",
) -> Any:
    from app.db.models.org_members import OrgMember

    m = OrgMember()
    m.id = member_id or uuid.UUID("00000000-0000-0000-0000-000000000050")
    m.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    m.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    m.role = role
    m.role_v2 = None
    m.principal_class = None
    m.access_profile = None
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
def make_user_row() -> Any:
    return _make_user_row


@pytest.fixture
def make_member() -> Any:
    return _make_member
