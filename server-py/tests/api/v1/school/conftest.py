"""
School API 测试共享 fixture.

镜像 ``tests/api/v1/eap/conftest.py`` — mock_db + setup_db_results FIFO + dependency_overrides.

关键差异:
  - school 路由要求 ``org_type == 'school'``, fixture 默认就给 OrgContext(org_type='school').
  - non_school_admin_client: 用 counseling 类型 → 验 403 守门.

Test app builder:
  ``app/main.py`` 暂未 register school routers (按任务规则不改 main), build test-only app.

School prefix:
  - /api/orgs/{org_id}/school/classes    → class_router
  - /api/orgs/{org_id}/school/students   → student_router
  - /api/orgs/{org_id}/school/analytics  → analytics_router
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
def _school_test_env(base_env: pytest.MonkeyPatch) -> None:
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


def _build_school_test_app() -> FastAPI:
    from app.api.v1.school import analytics_router, class_router, student_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(class_router, prefix="/api/orgs/{org_id}/school/classes", tags=["school"])
    app.include_router(student_router, prefix="/api/orgs/{org_id}/school/students", tags=["school"])
    app.include_router(
        analytics_router, prefix="/api/orgs/{org_id}/school/analytics", tags=["school"]
    )
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_school_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


def _make_org_context(
    role: str = "org_admin",
    role_v2: str = "school_admin",
    org_type: str = "school",
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
def admin_school_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(school + org_admin)."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="principal@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def counselor_school_client(test_app: FastAPI) -> Iterator[TestClient]:
    """school + counselor — 用于 patch /students 允许 counselor 写; CRUD class 不允许."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="c@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def non_school_admin_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin', org_type='counseling').

    用于校验 school 端点对非 school org → 403.
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


# ─── 工厂 helper ────────────────────────────────────────────────


def _make_class(
    *,
    class_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    grade: str = "高一",
    class_name: str = "1 班",
    homeroom_teacher_id: uuid.UUID | None = None,
    student_count: int = 0,
) -> Any:
    from app.db.models.school_classes import SchoolClass

    c = SchoolClass()
    c.id = class_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.grade = grade
    c.class_name = class_name
    c.homeroom_teacher_id = homeroom_teacher_id
    c.student_count = student_count
    return c


def _make_student_profile(
    *,
    profile_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    student_id: str | None = "S001",
    grade: str | None = "高一",
    class_name: str | None = "1 班",
) -> Any:
    from app.db.models.school_student_profiles import SchoolStudentProfile

    p = SchoolStudentProfile()
    p.id = profile_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    p.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    p.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    p.student_id = student_id
    p.grade = grade
    p.class_name = class_name
    p.parent_name = None
    p.parent_phone = None
    p.parent_email = None
    p.entry_method = "import"
    return p


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "Student",
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


@pytest.fixture
def make_class() -> Any:
    return _make_class


@pytest.fixture
def make_student_profile() -> Any:
    return _make_student_profile


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row
