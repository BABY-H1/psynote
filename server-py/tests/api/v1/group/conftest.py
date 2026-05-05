"""
Group API 测试共享 fixture。

镜像 ``tests/api/v1/org/conftest.py`` 的 mock_db (AsyncSession) +
setup_db_results FIFO + dependency_overrides 注入 OrgContext 模式。

设计要点:
  - autouse ``_group_test_env``: 与 auth / org 同, 设 NODE_ENV=test 让 Settings()
    可构造.
  - ``mock_db``: AsyncMock + sync ``add`` + ``flush``; 默认 AsyncMock execute
    可被 ``setup_db_results`` 配 side_effect.
  - ``setup_db_results``: FIFO ``execute`` 返回, 每条 row 自动包成 mock Result.
  - ``client``: 默认无认证 — 用于公开端点 (public-enroll).
  - ``authed_client``: 注入 fake AuthUser. 用于一般已认证端点.
  - ``admin_org_client``: org_admin 角色 + OrgContext.
  - ``counselor_org_client``: counselor 角色 + OrgContext (validates roles below admin).
  - ``client_role_org_client``: legacy 'client' 角色, 用于 rejectClient 验证.

Routers 挂载:
  ``app/main.py`` 暂未 register group routers (按任务规则不改 main), 这里在
  conftest 内 build 一个 test-only FastAPI app, 挂上 group sub-routers + 共
  用 error_handler. dependency_overrides 同样适用于这个 app 实例.

Group prefix 选择 (与 Node app.ts:160-165 对齐):
  - /api/orgs/{org_id}/group/schemes      → scheme_router
  - /api/orgs/{org_id}/group/instances    → instance_router + session_router + enrollment_router
  - /api/public/groups                    → public_enroll_router
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _group_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result.

    支持 ``scalar_one_or_none()`` / ``scalar()`` / ``first()`` / ``all()`` /
    ``scalars().all()``. 保持与 org/conftest 等价行为.
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


# ─── Test app builder (group routers, error_handler 与生产对齐) ──


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


def _build_group_test_app() -> FastAPI:
    """build 一个 test-only FastAPI app 挂 group routers + 标准 error_handler.

    与 ``app/main.py`` 的 register 顺序保持一致 (Tier 2 agents 完成后, 全 Tier 2
    会在 main 中 register; 测试期我们独立 build 一份).
    """
    from app.api.v1.group import (
        enrollment_router,
        instance_router,
        public_enroll_router,
        scheme_router,
        session_router,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    # /api/orgs/{org_id}/group/schemes
    app.include_router(scheme_router, prefix="/api/orgs/{org_id}/group/schemes", tags=["group"])
    # /api/orgs/{org_id}/group/instances — 同前缀挂 instance + session + enrollment
    app.include_router(instance_router, prefix="/api/orgs/{org_id}/group/instances", tags=["group"])
    app.include_router(session_router, prefix="/api/orgs/{org_id}/group/instances", tags=["group"])
    app.include_router(
        enrollment_router, prefix="/api/orgs/{org_id}/group/instances", tags=["group"]
    )
    # /api/public/groups (无 auth)
    app.include_router(public_enroll_router, prefix="/api/public/groups", tags=["group-public"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    """专属 test app, 注入 mock_db. teardown 清空 overrides."""
    from app.core.database import get_db

    app = _build_group_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(test_app: FastAPI) -> TestClient:
    """无认证 TestClient (公开端点)."""
    return TestClient(test_app)


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


def _make_org_context(role: str = "org_admin", role_v2: str = "clinic_admin") -> Any:
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
def authed_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 (无 OrgContext) — 用于不需要 org 的端点 (本模块都需要 org, 主要给完整性)."""
    from app.middleware.auth import AuthUser, get_current_user

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="user@example.com",
        is_system_admin=False,
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def admin_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='org_admin')."""
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
def counselor_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='counselor'). 用于 admin-only 端点 → 403."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="counselor@example.com",
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
def client_role_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='client'). 用于 rejectClient 验证."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="client@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


# ─── 工厂 helper: 构造 ORM 实例 (无副作用) ──────────────────


def _make_scheme(
    *,
    scheme_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "Test Scheme",
    visibility: str = "personal",
    created_by: uuid.UUID | None = None,
) -> Any:
    from app.db.models.group_schemes import GroupScheme

    s = GroupScheme()
    s.id = scheme_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    s.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    s.title = title
    s.description = None
    s.theory = None
    s.overall_goal = None
    s.specific_goals = []
    s.target_audience = None
    s.age_range = None
    s.selection_criteria = None
    s.recommended_size = None
    s.total_sessions = None
    s.session_duration = None
    s.frequency = None
    s.facilitator_requirements = None
    s.evaluation_method = None
    s.notes = None
    s.recruitment_assessments = []
    s.overall_assessments = []
    s.screening_notes = None
    s.visibility = visibility
    s.allowed_org_ids = []
    s.created_by = created_by or uuid.UUID(_FAKE_USER_ID)
    return s


def _make_scheme_session(
    *,
    session_id: uuid.UUID | None = None,
    scheme_id: uuid.UUID | None = None,
    title: str = "Session 1",
    sort_order: int = 0,
) -> Any:
    from app.db.models.group_scheme_sessions import GroupSchemeSession

    ss = GroupSchemeSession()
    ss.id = session_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    ss.scheme_id = scheme_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    ss.title = title
    ss.goal = None
    ss.phases = []
    ss.materials = None
    ss.duration = None
    ss.homework = None
    ss.assessment_notes = None
    ss.related_goals = []
    ss.session_theory = None
    ss.session_evaluation = None
    ss.sort_order = sort_order
    ss.related_assessments = []
    return ss


def _make_instance(
    *,
    instance_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    scheme_id: uuid.UUID | None = None,
    title: str = "Test Group",
    status: str = "draft",
    capacity: int | None = None,
    leader_id: uuid.UUID | None = None,
    assessment_config: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.group_instances import GroupInstance

    i = GroupInstance()
    i.id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    i.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    i.scheme_id = scheme_id
    i.title = title
    i.description = None
    i.category = None
    i.leader_id = leader_id or uuid.UUID(_FAKE_USER_ID)
    i.schedule = None
    i.duration = None
    i.start_date = None
    i.location = None
    i.status = status
    i.capacity = capacity
    i.recruitment_assessments = []
    i.overall_assessments = []
    i.screening_notes = None
    i.assessment_config = assessment_config or {}
    i.created_by = uuid.UUID(_FAKE_USER_ID)
    return i


def _make_enrollment(
    *,
    enrollment_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    status: str = "pending",
    care_episode_id: uuid.UUID | None = None,
) -> Any:
    from app.db.models.group_enrollments import GroupEnrollment

    e = GroupEnrollment()
    e.id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
    e.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    e.user_id = user_id or uuid.UUID(_FAKE_USER_ID)
    e.care_episode_id = care_episode_id
    e.status = status
    e.screening_result_id = None
    e.enrolled_at = None
    return e


def _make_session_record(
    *,
    record_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    session_number: int = 1,
    title: str = "Session 1",
    status: str = "planned",
) -> Any:
    from app.db.models.group_session_records import GroupSessionRecord

    r = GroupSessionRecord()
    r.id = record_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    r.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    r.scheme_session_id = None
    r.session_number = session_number
    r.title = title
    r.date = None
    r.status = status
    r.notes = None
    return r


def _make_attendance(
    *,
    attendance_id: uuid.UUID | None = None,
    session_record_id: uuid.UUID | None = None,
    enrollment_id: uuid.UUID | None = None,
    status: str = "present",
) -> Any:
    from app.db.models.group_session_attendance import GroupSessionAttendance

    a = GroupSessionAttendance()
    a.id = attendance_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    a.session_record_id = session_record_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    a.enrollment_id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
    a.status = status
    a.note = None
    return a


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
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


@pytest.fixture
def make_scheme() -> Any:
    return _make_scheme


@pytest.fixture
def make_scheme_session() -> Any:
    return _make_scheme_session


@pytest.fixture
def make_instance() -> Any:
    return _make_instance


@pytest.fixture
def make_enrollment() -> Any:
    return _make_enrollment


@pytest.fixture
def make_session_record() -> Any:
    return _make_session_record


@pytest.fixture
def make_attendance() -> Any:
    return _make_attendance


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row
