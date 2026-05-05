"""
EAP API 测试共享 fixture.

镜像 ``tests/api/v1/group/conftest.py`` 的 mock_db (AsyncSession) +
setup_db_results FIFO + dependency_overrides 注入 OrgContext 模式.

关键差异:
  - EAP analytics 端点要求 ``org_type == 'enterprise'``, 故 enterprise_admin_client fixture
    专门 OrgContext(org_type='enterprise').
  - school 测试 fixture 在 ``tests/api/v1/school/conftest.py`` 平行存在 (org_type='school').

Test app builder:
  ``app/main.py`` 暂未 register eap routers (按任务规则不改 main), 这里 build 一个
  test-only FastAPI app 挂上 eap sub-routers + 标准 error_handler. 与 group 测试一致风格.

EAP prefix 选择 (与 Node app.ts 对齐):
  - /api/orgs/{org_id}/eap/partnerships   → partnership_router
  - /api/orgs/{org_id}/eap/assignments    → assignment_router
  - /api/orgs/{org_id}/eap/analytics      → analytics_router
  - /api/public/eap                       → public_router
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.api.v1._conftest_helpers import (
    SetupDbResults,
    make_mock_db,
    setup_db_results_factory,
)


@pytest.fixture(autouse=True)
def _eap_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    return setup_db_results_factory(mock_db)


# ─── Test app builder ────────────────────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


def _build_eap_test_app() -> FastAPI:
    from app.api.v1.eap import (
        analytics_router,
        assignment_router,
        partnership_router,
        public_router,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        partnership_router,
        prefix="/api/orgs/{org_id}/eap/partnerships",
        tags=["eap"],
    )
    app.include_router(
        assignment_router,
        prefix="/api/orgs/{org_id}/eap/assignments",
        tags=["eap"],
    )
    app.include_router(
        analytics_router,
        prefix="/api/orgs/{org_id}/eap/analytics",
        tags=["eap"],
    )
    app.include_router(public_router, prefix="/api/public/eap", tags=["eap-public"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    """专属 test app, 注入 mock_db. teardown 清空 overrides."""
    from app.core.database import get_db

    app = _build_eap_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(test_app: FastAPI) -> TestClient:
    """无认证 TestClient — 用于公开端点 (eap-public)."""
    return TestClient(test_app)


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


def _make_org_context(
    role: str = "org_admin",
    role_v2: str = "clinic_admin",
    org_type: str = "counseling",
) -> Any:
    from app.middleware.org_context import LicenseInfo, OrgContext

    return OrgContext(
        org_id=_FAKE_ORG_ID,
        org_type=org_type,
        role=role,
        role_v2=role_v2,
        member_id="member-x",
        full_practice_access=(role == "org_admin"),
        tier="starter",
        license=LicenseInfo(status="none"),
    )


@pytest.fixture
def admin_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin', org_type='counseling').

    用于 partnership/assignment 路由 (它们不要求 enterprise org 类型).
    """
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="admin@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def enterprise_admin_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin', org_type='enterprise').

    用于 EAP analytics — 必须 enterprise org 才允许.
    """
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="hr@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        org_type="enterprise"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def counselor_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='counselor'). 用于校验 admin-only 端点 → 403."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="c@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor", org_type="enterprise"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def non_enterprise_admin_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin', org_type='counseling').

    用于校验 EAP analytics 端点对非 enterprise org → 403.
    """
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="admin@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        org_type="counseling"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


# ─── 工厂 helper: 构造 ORM 实例 ─────────────────────────────────


def _make_org(
    *,
    org_id: uuid.UUID | None = None,
    name: str = "Test Org",
    slug: str = "test-org",
    plan: str = "premium",  # flagship → tier 含 partnership; enterprise org_type 自带 eap
    settings: dict[str, Any] | None = None,
    license_key: str | None = None,
) -> Any:
    from app.db.models.organizations import Organization

    o = Organization()
    o.id = org_id or uuid.UUID(_FAKE_ORG_ID)
    o.name = name
    o.slug = slug
    o.plan = plan
    o.license_key = license_key
    o.settings = settings or {"orgType": "enterprise"}
    o.triage_config = {}
    o.data_retention_policy = None
    o.parent_org_id = None
    o.org_level = "leaf"
    return o


def _make_partnership(
    *,
    partnership_id: uuid.UUID | None = None,
    enterprise_org_id: uuid.UUID | None = None,
    provider_org_id: uuid.UUID | None = None,
    status: str = "active",
) -> Any:
    from app.db.models.eap_partnerships import EAPPartnership

    p = EAPPartnership()
    p.id = partnership_id or uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    p.enterprise_org_id = enterprise_org_id or uuid.UUID(_FAKE_ORG_ID)
    p.provider_org_id = provider_org_id or uuid.UUID("00000000-0000-0000-0000-0000000000bb")
    p.status = status
    p.contract_start = None
    p.contract_end = None
    p.seat_allocation = None
    p.service_scope = {}
    p.notes = None
    p.created_by = None
    return p


def _make_assignment(
    *,
    assignment_id: uuid.UUID | None = None,
    partnership_id: uuid.UUID | None = None,
    enterprise_org_id: uuid.UUID | None = None,
    provider_org_id: uuid.UUID | None = None,
    counselor_user_id: uuid.UUID | None = None,
    status: str = "active",
) -> Any:
    from app.db.models.eap_counselor_assignments import EAPCounselorAssignment

    a = EAPCounselorAssignment()
    a.id = assignment_id or uuid.UUID("00000000-0000-0000-0000-0000000000cc")
    a.partnership_id = partnership_id or uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    a.enterprise_org_id = enterprise_org_id or uuid.UUID(_FAKE_ORG_ID)
    a.provider_org_id = provider_org_id or uuid.UUID("00000000-0000-0000-0000-0000000000bb")
    a.counselor_user_id = counselor_user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    a.status = status
    a.assigned_by = None
    a.removed_at = None
    return a


def _make_org_member(
    *,
    member_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    role: str = "counselor",
    status: str = "active",
    specialties: list[str] | None = None,
    bio: str | None = None,
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
    m.specialties = specialties or []
    m.max_caseload = None
    m.bio = bio
    return m


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "User",
    password_hash: str | None = None,
) -> Any:
    from app.db.models.users import User

    u = User()
    u.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    u.email = email
    u.name = name
    u.password_hash = password_hash
    u.avatar_url = None
    u.is_system_admin = False
    return u


@pytest.fixture
def make_org() -> Any:
    return _make_org


@pytest.fixture
def make_partnership() -> Any:
    return _make_partnership


@pytest.fixture
def make_assignment() -> Any:
    return _make_assignment


@pytest.fixture
def make_org_member() -> Any:
    return _make_org_member


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row
