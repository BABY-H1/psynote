"""
Course API 测试共享 fixture。

镜像 ``tests/api/v1/group/conftest.py`` 的 mock_db (AsyncSession) +
setup_db_results FIFO + dependency_overrides 注入 OrgContext 模式 (Tier 2 同套规范).

设计要点:
  - autouse ``_course_test_env``: 与 auth / org / group 同, 设 NODE_ENV=test 让
    Settings() 可构造.
  - ``mock_db``: AsyncMock + sync ``add`` + ``flush``; 默认 AsyncMock execute
    可被 ``setup_db_results`` 配 side_effect.
  - ``setup_db_results``: FIFO ``execute`` 返回, 每条 row 自动包成 mock Result.
  - ``client``: 默认无认证 — 用于公开端点 (public-enroll).
  - ``authed_client``: 注入 fake AuthUser. 用于一般已认证端点.
  - ``admin_org_client``: org_admin 角色 + OrgContext.
  - ``counselor_org_client``: counselor 角色 + OrgContext.
  - ``client_role_org_client``: legacy 'client' 角色, 用于 rejectClient 验证.

Routers 挂载:
  ``app/main.py`` 暂未 register course routers (按任务规则不改 main), 这里在
  conftest 内 build 一个 test-only FastAPI app, 挂上 course sub-routers + 共用
  error_handler. dependency_overrides 同样适用于这个 app 实例.

Course prefix 选择 (与 Node app.ts:189-193, 233 对齐):
  - /api/orgs/{org_id}/courses             → router (course CRUD + lifecycle + 子资源)
  - /api/orgs/{org_id}/course-instances    → instance_router + enrollment_router + feedback_router + homework_router
  - /api/public/courses                    → public_enroll_router
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
def _course_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result。

    支持 ``scalar_one_or_none()`` / ``scalar()`` / ``first()`` / ``all()`` /
    ``scalars().all()``. 与 group/conftest 等价行为.
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


def _build_course_test_app() -> FastAPI:
    """build 一个 test-only FastAPI app 挂 course routers + 标准 error_handler.

    与 ``app/main.py`` register 顺序保持一致 (Tier 2 agents 完成后, main 会统一
    register; 测试期独立 build 一份).
    """
    from app.api.v1.course import (
        enrollment_router,
        feedback_router,
        homework_router,
        instance_router,
        public_enroll_router,
        router,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    # /api/orgs/{org_id}/courses
    app.include_router(router, prefix="/api/orgs/{org_id}/courses", tags=["course"])
    # /api/orgs/{org_id}/course-instances — 同前缀挂 instance + enrollment + feedback + homework
    app.include_router(
        instance_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course-instance"],
    )
    app.include_router(
        enrollment_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course-enrollment"],
    )
    app.include_router(
        feedback_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course-feedback"],
    )
    app.include_router(
        homework_router,
        prefix="/api/orgs/{org_id}/course-instances",
        tags=["course-homework"],
    )
    # /api/public/courses (无 auth)
    app.include_router(public_enroll_router, prefix="/api/public/courses", tags=["course-public"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    """专属 test app, 注入 mock_db. teardown 清空 overrides."""
    from app.core.database import get_db

    app = _build_course_test_app()
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
    """已认证 + OrgContext(role='counselor')."""
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
    """已认证 + OrgContext(legacy role='client'). 用于 rejectClient 验证."""
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


def _make_course(
    *,
    course_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "Test Course",
    status: str = "draft",
    is_template: bool = False,
    is_public: bool = False,
    course_type: str | None = None,
) -> Any:
    from app.db.models.courses import Course

    c = Course()
    c.id = course_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.title = title
    c.description = None
    c.category = None
    c.cover_url = None
    c.duration = None
    c.is_public = is_public
    c.status = status
    c.creation_mode = "manual"
    c.course_type = course_type
    c.target_audience = None
    c.scenario = None
    c.responsible_id = None
    c.is_template = is_template
    c.source_template_id = None
    c.requirements_config = {}
    c.blueprint_data = {}
    c.tags = []
    c.allowed_org_ids = []
    c.created_by = uuid.UUID(_FAKE_USER_ID)
    return c


def _make_chapter(
    *,
    chapter_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
    title: str = "Chapter 1",
    sort_order: int = 0,
) -> Any:
    from app.db.models.course_chapters import CourseChapter

    ch = CourseChapter()
    ch.id = chapter_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    ch.course_id = course_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    ch.title = title
    ch.content = None
    ch.video_url = None
    ch.duration = None
    ch.sort_order = sort_order
    ch.related_assessment_id = None
    ch.session_goal = None
    ch.core_concepts = None
    ch.interaction_suggestions = None
    ch.homework_suggestion = None
    return ch


def _make_lesson_block(
    *,
    block_id: uuid.UUID | None = None,
    chapter_id: uuid.UUID | None = None,
    block_type: str = "opening",
    sort_order: int = 0,
) -> Any:
    from app.db.models.course_lesson_blocks import CourseLessonBlock

    b = CourseLessonBlock()
    b.id = block_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    b.chapter_id = chapter_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    b.block_type = block_type
    b.content = None
    b.sort_order = sort_order
    b.ai_generated = False
    b.last_ai_instruction = None
    return b


def _make_template_tag(
    *,
    tag_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    name: str = "焦虑",
    color: str | None = None,
) -> Any:
    from app.db.models.course_template_tags import CourseTemplateTag

    t = CourseTemplateTag()
    t.id = tag_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
    t.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    t.name = name
    t.color = color
    return t


def _make_instance(
    *,
    instance_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
    title: str = "Test Instance",
    publish_mode: str = "assign",
    status: str = "draft",
    capacity: int | None = None,
) -> Any:
    from app.db.models.course_instances import CourseInstance

    i = CourseInstance()
    i.id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    i.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    i.course_id = course_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    i.title = title
    i.description = None
    i.publish_mode = publish_mode
    i.status = status
    i.capacity = capacity
    i.target_group_label = None
    i.responsible_id = None
    i.assessment_config = {}
    i.location = None
    i.start_date = None
    i.schedule = None
    i.created_by = uuid.UUID(_FAKE_USER_ID)
    return i


def _make_enrollment(
    *,
    enrollment_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    status: str = "enrolled",
    approval_status: str | None = "auto_approved",
    enrollment_source: str | None = "self_enroll",
) -> Any:
    from app.db.models.course_enrollments import CourseEnrollment

    e = CourseEnrollment()
    e.id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    e.course_id = course_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    e.instance_id = instance_id
    e.user_id = user_id or uuid.UUID(_FAKE_USER_ID)
    e.care_episode_id = None
    e.assigned_by = None
    e.enrollment_source = enrollment_source
    e.approval_status = approval_status
    e.approved_by = None
    e.progress = {}
    e.status = status
    e.enrolled_at = None  # type: ignore[assignment]
    e.completed_at = None
    return e


def _make_feedback_form(
    *,
    form_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    chapter_id: uuid.UUID | None = None,
    title: str | None = "Feedback",
    questions: list[Any] | None = None,
    is_active: bool = True,
) -> Any:
    from app.db.models.course_feedback_forms import CourseFeedbackForm

    f = CourseFeedbackForm()
    f.id = form_id or uuid.UUID("00000000-0000-0000-0000-000000000777")
    f.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    f.chapter_id = chapter_id
    f.title = title
    f.questions = questions or []
    f.is_active = is_active
    return f


def _make_feedback_response(
    *,
    response_id: uuid.UUID | None = None,
    form_id: uuid.UUID | None = None,
    enrollment_id: uuid.UUID | None = None,
    answers: list[Any] | None = None,
) -> Any:
    from app.db.models.course_feedback_responses import CourseFeedbackResponse

    r = CourseFeedbackResponse()
    r.id = response_id or uuid.UUID("00000000-0000-0000-0000-000000000888")
    r.form_id = form_id or uuid.UUID("00000000-0000-0000-0000-000000000777")
    r.enrollment_id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    r.answers = answers or []
    r.submitted_at = None  # type: ignore[assignment]
    return r


def _make_homework_def(
    *,
    def_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    chapter_id: uuid.UUID | None = None,
    title: str | None = "HW",
    question_type: str = "text",
    is_required: bool = True,
    sort_order: int = 0,
) -> Any:
    from app.db.models.course_homework_defs import CourseHomeworkDef

    d = CourseHomeworkDef()
    d.id = def_id or uuid.UUID("00000000-0000-0000-0000-000000000aaa")
    d.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    d.chapter_id = chapter_id
    d.title = title
    d.description = None
    d.question_type = question_type
    d.options = None
    d.is_required = is_required
    d.sort_order = sort_order
    return d


def _make_homework_submission(
    *,
    submission_id: uuid.UUID | None = None,
    homework_def_id: uuid.UUID | None = None,
    enrollment_id: uuid.UUID | None = None,
    status: str = "submitted",
) -> Any:
    from app.db.models.course_homework_submissions import CourseHomeworkSubmission

    s = CourseHomeworkSubmission()
    s.id = submission_id or uuid.UUID("00000000-0000-0000-0000-000000000bbb")
    s.homework_def_id = homework_def_id or uuid.UUID("00000000-0000-0000-0000-000000000aaa")
    s.enrollment_id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    s.content = None
    s.selected_options = None
    s.status = status
    s.review_comment = None
    s.reviewed_by = None
    s.reviewed_at = None
    s.submitted_at = None  # type: ignore[assignment]
    s.updated_at = None  # type: ignore[assignment]
    return s


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
def make_course() -> Any:
    return _make_course


@pytest.fixture
def make_chapter() -> Any:
    return _make_chapter


@pytest.fixture
def make_lesson_block() -> Any:
    return _make_lesson_block


@pytest.fixture
def make_template_tag() -> Any:
    return _make_template_tag


@pytest.fixture
def make_instance() -> Any:
    return _make_instance


@pytest.fixture
def make_enrollment() -> Any:
    return _make_enrollment


@pytest.fixture
def make_feedback_form() -> Any:
    return _make_feedback_form


@pytest.fixture
def make_feedback_response() -> Any:
    return _make_feedback_response


@pytest.fixture
def make_homework_def() -> Any:
    return _make_homework_def


@pytest.fixture
def make_homework_submission() -> Any:
    return _make_homework_submission


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row
