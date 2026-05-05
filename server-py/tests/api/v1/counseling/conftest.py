"""
Counseling API 测试共享 fixture (镜像 ``tests/api/v1/course/conftest.py`` 风格)。

Routers 挂载: 与 ``app/main.py`` 还没注册 (按任务规则不改 main), 这里在 conftest
内 build test-only FastAPI app, 挂上全部 13 个 sub-routers + 共用 error_handler.

Fixtures:
  - ``mock_db`` AsyncSession mock (含 add/commit/rollback/flush/execute/delete/refresh)
  - ``setup_db_results`` FIFO ``execute`` 返回, 每条 row 自动包成 mock Result
  - ``client`` 无认证 — 公开端点用 (counseling-public)
  - ``authed_client`` 已认证 (无 OrgContext)
  - ``admin_org_client`` 已认证 + OrgContext(role='org_admin')
  - ``counselor_org_client`` 已认证 + OrgContext(role='counselor')
  - ``client_role_org_client`` 已认证 + OrgContext(legacy role='client') — rejectClient 验证

各 router prefix 与 Node app.ts 对齐:
  /api/orgs/{org_id}/care-episodes        (router)
  /api/orgs/{org_id}/appointments         (appointment_router)
  /api/orgs/{org_id}/availability         (availability_router)
  /api/orgs/{org_id}/session-notes        (session_note_router)
  /api/orgs/{org_id}/note-templates       (note_template_router)
  /api/orgs/{org_id}/treatment-plans      (treatment_plan_router)
  /api/orgs/{org_id}/clients              (client_profile_router)
  /api/orgs/{org_id}/client-assignments   (client_assignment_router)
  /api/orgs/{org_id}/client-access-grants (client_access_grant_router)
  /api/orgs/{org_id}/goal-library         (goal_library_router)
  /api/orgs/{org_id}/ai-conversations     (ai_conversation_router)
  /api/public/counseling                  (public_router)
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
def _counseling_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result。

    支持 ``scalar_one_or_none()`` / ``scalar()`` / ``first()`` / ``all()`` /
    ``scalars().all()``。
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
    db.delete = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


# ─── Test app builder ────────────────────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


def _build_counseling_test_app() -> FastAPI:
    """build test-only FastAPI app 挂全部 counseling sub-routers + 标准 error_handler."""
    from app.api.v1.counseling import (
        ai_conversation_router,
        appointment_router,
        availability_router,
        client_access_grant_router,
        client_assignment_router,
        client_profile_router,
        goal_library_router,
        note_template_router,
        public_router,
        router,
        session_note_router,
        treatment_plan_router,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api/orgs/{org_id}/care-episodes", tags=["episode"])
    app.include_router(
        appointment_router, prefix="/api/orgs/{org_id}/appointments", tags=["appointment"]
    )
    app.include_router(
        availability_router, prefix="/api/orgs/{org_id}/availability", tags=["availability"]
    )
    app.include_router(
        session_note_router, prefix="/api/orgs/{org_id}/session-notes", tags=["session-note"]
    )
    app.include_router(
        note_template_router,
        prefix="/api/orgs/{org_id}/note-templates",
        tags=["note-template"],
    )
    app.include_router(
        treatment_plan_router,
        prefix="/api/orgs/{org_id}/treatment-plans",
        tags=["treatment-plan"],
    )
    app.include_router(
        client_profile_router, prefix="/api/orgs/{org_id}/clients", tags=["client-profile"]
    )
    app.include_router(
        client_assignment_router,
        prefix="/api/orgs/{org_id}/client-assignments",
        tags=["client-assignment"],
    )
    app.include_router(
        client_access_grant_router,
        prefix="/api/orgs/{org_id}/client-access-grants",
        tags=["client-access-grant"],
    )
    app.include_router(
        goal_library_router, prefix="/api/orgs/{org_id}/goal-library", tags=["goal-library"]
    )
    app.include_router(
        ai_conversation_router,
        prefix="/api/orgs/{org_id}/ai-conversations",
        tags=["ai-conversation"],
    )
    app.include_router(public_router, prefix="/api/public/counseling", tags=["counseling-public"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    """专属 test app, 注入 mock_db. teardown 清空 overrides."""
    from app.core.database import get_db

    app = _build_counseling_test_app()
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
    """已认证 (无 OrgContext)."""
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


# ─── 工厂 helper: ORM 实例 (无副作用) ──────────────────────


def _make_episode(
    *,
    episode_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    status: str = "active",
    chief_complaint: str | None = None,
    current_risk: str = "level_1",
    intervention_type: str | None = None,
) -> Any:
    from app.db.models.care_episodes import CareEpisode

    e = CareEpisode()
    e.id = episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    e.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    e.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    e.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    e.status = status
    e.chief_complaint = chief_complaint
    e.current_risk = current_risk
    e.intervention_type = intervention_type
    e.opened_at = None  # type: ignore[assignment]
    e.closed_at = None
    return e


def _make_appointment(
    *,
    appt_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    status: str = "pending",
) -> Any:
    from datetime import UTC, datetime, timedelta

    from app.db.models.appointments import Appointment

    a = Appointment()
    a.id = appt_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    a.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    a.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    a.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    a.care_episode_id = care_episode_id
    a.start_time = datetime.now(UTC) + timedelta(hours=1)
    a.end_time = datetime.now(UTC) + timedelta(hours=2)
    a.status = status
    a.type = None
    a.source = None
    a.notes = None
    a.reminder_sent_24h = False
    a.reminder_sent_1h = False
    a.client_confirmed_at = None
    a.confirm_token = None
    return a


def _make_availability(
    *,
    slot_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    day_of_week: int = 1,
    start_time: str = "09:00",
    end_time: str = "10:00",
    session_type: str | None = None,
    is_active: bool = True,
) -> Any:
    from app.db.models.counselor_availability import CounselorAvailability

    s = CounselorAvailability()
    s.id = slot_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    s.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    s.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    s.day_of_week = day_of_week
    s.start_time = start_time
    s.end_time = end_time
    s.session_type = session_type
    s.is_active = is_active
    return s


def _make_session_note(
    *,
    note_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    note_format: str = "soap",
    summary: str | None = None,
) -> Any:
    from datetime import date as date_type

    from app.db.models.session_notes import SessionNote

    n = SessionNote()
    n.id = note_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
    n.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    n.care_episode_id = care_episode_id
    n.appointment_id = None
    n.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    n.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    n.note_format = note_format
    n.template_id = None
    n.session_date = date_type(2026, 1, 1)
    n.duration = None
    n.session_type = None
    n.subjective = "S 内容"
    n.objective = None
    n.assessment = None
    n.plan = None
    n.fields = {}
    n.summary = summary
    n.tags = []
    n.status = "draft"
    n.supervisor_annotation = None
    n.submitted_for_review_at = None
    return n


def _make_note_template(
    *,
    template_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "我的模板",
    format_: str = "custom",
    visibility: str = "personal",
) -> Any:
    from app.db.models.note_templates import NoteTemplate

    t = NoteTemplate()
    t.id = template_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    t.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    t.title = title
    t.format = format_
    t.field_definitions = []
    t.is_default = False
    t.visibility = visibility
    t.allowed_org_ids = []
    t.created_by = uuid.UUID(_FAKE_USER_ID)
    return t


def _make_treatment_plan(
    *,
    plan_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    status: str = "draft",
    title: str | None = "Plan A",
    goals: list[Any] | None = None,
) -> Any:
    from app.db.models.treatment_plans import TreatmentPlan

    p = TreatmentPlan()
    p.id = plan_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    p.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    p.care_episode_id = care_episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    p.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    p.status = status
    p.title = title
    p.approach = None
    p.goals = goals or []
    p.interventions = []
    p.session_plan = None
    p.progress_notes = None
    p.review_date = None
    return p


def _make_client_profile(
    *,
    profile_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> Any:
    from app.db.models.client_profiles import ClientProfile

    p = ClientProfile()
    p.id = profile_id or uuid.UUID("00000000-0000-0000-0000-000000000777")
    p.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    p.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    p.phone = None
    p.gender = None
    p.date_of_birth = None
    p.address = None
    p.occupation = None
    p.education = None
    p.marital_status = None
    p.emergency_contact = None
    p.medical_history = None
    p.family_background = None
    p.presenting_issues = []
    p.notes = None
    return p


def _make_assignment(
    *,
    assignment_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    is_primary: bool = True,
) -> Any:
    from app.db.models.client_assignments import ClientAssignment

    a = ClientAssignment()
    a.id = assignment_id or uuid.UUID("00000000-0000-0000-0000-000000000888")
    a.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    a.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    a.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    a.is_primary = is_primary
    return a


def _make_grant(
    *,
    grant_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    granted_to: uuid.UUID | None = None,
    granted_by: uuid.UUID | None = None,
    reason: str = "代班",
    revoked_at: Any = None,
) -> Any:
    from app.db.models.client_access_grants import ClientAccessGrant

    g = ClientAccessGrant()
    g.id = grant_id or uuid.UUID("00000000-0000-0000-0000-000000000999")
    g.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    g.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    g.granted_to_counselor_id = granted_to or uuid.UUID(_FAKE_USER_ID)
    g.granted_by = granted_by or uuid.UUID(_FAKE_USER_ID)
    g.reason = reason
    g.expires_at = None
    g.revoked_at = revoked_at
    return g


def _make_goal_library(
    *,
    goal_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "降低焦虑",
    problem_area: str = "anxiety",
    visibility: str = "personal",
) -> Any:
    from app.db.models.treatment_goal_library import TreatmentGoalLibrary

    g = TreatmentGoalLibrary()
    g.id = goal_id or uuid.UUID("00000000-0000-0000-0000-000000000aaa")
    g.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    g.title = title
    g.description = None
    g.problem_area = problem_area
    g.category = None
    g.objectives_template = []
    g.intervention_suggestions = []
    g.visibility = visibility
    g.allowed_org_ids = []
    g.created_by = uuid.UUID(_FAKE_USER_ID)
    return g


def _make_ai_conversation(
    *,
    conv_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    mode: str = "note",
    title: str | None = None,
) -> Any:
    from app.db.models.ai_conversations import AIConversation

    c = AIConversation()
    c.id = conv_id or uuid.UUID("00000000-0000-0000-0000-000000000bbb")
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.care_episode_id = care_episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    c.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    c.mode = mode
    c.title = title
    c.messages = []
    c.summary = None
    c.session_note_id = None
    return c


def _make_organization(
    *,
    org_id: uuid.UUID | None = None,
    name: str = "阳光心理咨询中心",
    slug: str = "sunshine",
    settings: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.organizations import Organization

    o = Organization()
    o.id = org_id or uuid.UUID(_FAKE_ORG_ID)
    o.name = name
    o.slug = slug
    o.plan = "free"
    o.license_key = None
    o.settings = settings or {"orgType": "counseling"}
    o.triage_config = {}
    o.data_retention_policy = {}
    o.parent_org_id = None
    o.org_level = "leaf"
    return o


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "User",
    password_hash: str | None = None,
    is_system_admin: bool = False,
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
    return u


@pytest.fixture
def make_episode() -> Any:
    return _make_episode


@pytest.fixture
def make_appointment() -> Any:
    return _make_appointment


@pytest.fixture
def make_availability() -> Any:
    return _make_availability


@pytest.fixture
def make_session_note() -> Any:
    return _make_session_note


@pytest.fixture
def make_note_template() -> Any:
    return _make_note_template


@pytest.fixture
def make_treatment_plan() -> Any:
    return _make_treatment_plan


@pytest.fixture
def make_client_profile() -> Any:
    return _make_client_profile


@pytest.fixture
def make_assignment() -> Any:
    return _make_assignment


@pytest.fixture
def make_grant() -> Any:
    return _make_grant


@pytest.fixture
def make_goal_library() -> Any:
    return _make_goal_library


@pytest.fixture
def make_ai_conversation() -> Any:
    return _make_ai_conversation


@pytest.fixture
def make_organization() -> Any:
    return _make_organization


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row
