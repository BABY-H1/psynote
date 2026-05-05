"""
Delivery API 测试共享 fixture (镜像 counseling / enrollment_response 同 pattern)。

Routers 挂载: 与 ``app/main.py`` 还没注册 (按任务规则不改 main), 这里在 conftest
内 build test-only FastAPI app, 挂上 delivery + person_archive 两个 router。

prefix 与 Node app.ts 对齐:
  /api/orgs/{org_id}/services         (router)            — 列表 + launch
  /api/orgs/{org_id}/people           (person_archive_router) — 人员档案

Fixtures:
  - ``mock_db``                AsyncSession mock (含 add/commit/flush/execute/refresh/...)
  - ``setup_db_results``       FIFO ``execute`` 返回, 每条 row 自动包成 mock Result
                                (支持 ``.mappings().all()`` / ``.scalars().all()`` / ``.first()`` /
                                ``.scalar_one_or_none()`` / ``.scalar()``)
  - ``admin_org_client``       已认证 + OrgContext(role='org_admin')
  - ``counselor_org_client``   已认证 + OrgContext(role='counselor')
  - ``client_role_org_client`` 已认证 + OrgContext(legacy role='client') — rejectClient 验证
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
def _delivery_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result。

    支持:
      - ``.scalar_one_or_none()`` (单行)
      - ``.scalars().all()``       (列表)
      - ``.scalar()``              (单标量, 含 None / int / row)
      - ``.first()``               (join 查 tuple 返一行)
      - ``.all()``                 (raw row tuples)
      - ``.mappings().all()``      (text() raw SQL 行 dict-like)
    """
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    result.scalar = MagicMock(return_value=row)
    if isinstance(row, list):
        rows_list = row
    elif row is None:
        rows_list = []
    else:
        rows_list = [row]
    result.all = MagicMock(return_value=rows_list)
    result.first = MagicMock(return_value=rows_list[0] if rows_list else None)
    scalars_obj = MagicMock()
    scalars_obj.all = MagicMock(return_value=rows_list)
    scalars_obj.first = MagicMock(return_value=rows_list[0] if rows_list else None)
    result.scalars = MagicMock(return_value=scalars_obj)

    mappings_obj = MagicMock()
    mappings_obj.all = MagicMock(return_value=rows_list)
    result.mappings = MagicMock(return_value=mappings_obj)
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
    db.delete = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


def _build_test_app() -> FastAPI:
    """build test-only FastAPI app, 挂 delivery + person_archive router + error_handler."""
    from app.api.v1.delivery import person_archive_router, router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api/orgs/{org_id}/services", tags=["delivery"])
    app.include_router(
        person_archive_router,
        prefix="/api/orgs/{org_id}/people",
        tags=["person-archive"],
    )
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


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


def _override_user_org(app: FastAPI, role: str, role_v2: str) -> None:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="user@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_org_context] = lambda: _make_org_context(role, role_v2)


@pytest.fixture
def admin_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    _override_user_org(test_app, "org_admin", "clinic_admin")
    yield TestClient(test_app)


@pytest.fixture
def counselor_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    _override_user_org(test_app, "counselor", "counselor")
    yield TestClient(test_app)


@pytest.fixture
def client_role_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    _override_user_org(test_app, "client", "client")
    yield TestClient(test_app)


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


# ─── ORM 实例 工厂 helpers (用于 person_archive 测试) ─────────


@pytest.fixture
def make_user_row() -> Any:
    def _make(
        *,
        user_id: uuid.UUID | None = None,
        name: str = "测试用户",
        email: str | None = "u@example.com",
    ) -> Any:
        from app.db.models.users import User

        u = User()
        u.id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        u.email = email
        u.name = name
        u.password_hash = None
        u.avatar_url = None
        u.is_system_admin = False
        u.is_guardian_account = False
        return u

    return _make


@pytest.fixture
def make_episode() -> Any:
    def _make(
        *,
        episode_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        client_id: uuid.UUID | None = None,
        status: str = "active",
        chief_complaint: str | None = "焦虑",
        current_risk: str = "level_1",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.care_episodes import CareEpisode

        e = CareEpisode()
        e.id = episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
        e.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        e.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        e.counselor_id = uuid.UUID(_FAKE_USER_ID)
        e.status = status
        e.chief_complaint = chief_complaint
        e.current_risk = current_risk
        e.intervention_type = None
        e.opened_at = datetime(2026, 1, 1, tzinfo=UTC)
        e.closed_at = None
        e.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        e.updated_at = datetime(2026, 5, 1, tzinfo=UTC)
        return e

    return _make


@pytest.fixture
def make_group_instance() -> Any:
    def _make(
        *,
        instance_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        title: str = "正念团辅",
        status: str = "ongoing",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.group_instances import GroupInstance

        g = GroupInstance()
        g.id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
        g.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        g.scheme_id = None
        g.title = title
        g.description = "团辅描述"
        g.category = None
        g.leader_id = uuid.UUID(_FAKE_USER_ID)
        g.schedule = None
        g.duration = None
        g.status = status
        g.capacity = 10
        g.recruitment_assessments = []
        g.overall_assessments = []
        g.screening_notes = None
        g.assessment_config = {}
        g.created_by = uuid.UUID(_FAKE_USER_ID)
        g.start_date = None
        g.location = None
        g.created_at = datetime(2026, 2, 1, tzinfo=UTC)
        g.updated_at = datetime(2026, 4, 1, tzinfo=UTC)
        return g

    return _make


@pytest.fixture
def make_group_enrollment() -> Any:
    def _make(
        *,
        enrollment_id: uuid.UUID | None = None,
        instance_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.group_enrollments import GroupEnrollment

        e = GroupEnrollment()
        e.id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000223")
        e.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
        e.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        e.care_episode_id = None
        e.status = "enrolled"
        e.screening_result_id = None
        e.enrolled_at = datetime(2026, 2, 5, tzinfo=UTC)
        e.created_at = datetime(2026, 2, 1, tzinfo=UTC)
        return e

    return _make


@pytest.fixture
def make_course_instance() -> Any:
    def _make(
        *,
        instance_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        title: str = "心理课程",
        status: str = "active",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.course_instances import CourseInstance

        c = CourseInstance()
        c.id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
        c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        c.course_id = uuid.UUID("00000000-0000-0000-0000-000000000c00")
        c.title = title
        c.description = "课程描述"
        c.publish_mode = "assign"
        c.status = status
        c.capacity = 30
        c.target_group_label = None
        c.responsible_id = uuid.UUID(_FAKE_USER_ID)
        c.assessment_config = {}
        c.location = None
        c.start_date = None
        c.schedule = None
        c.created_by = uuid.UUID(_FAKE_USER_ID)
        c.created_at = datetime(2026, 3, 1, tzinfo=UTC)
        c.updated_at = datetime(2026, 4, 15, tzinfo=UTC)
        return c

    return _make


@pytest.fixture
def make_course_enrollment() -> Any:
    def _make(
        *,
        enrollment_id: uuid.UUID | None = None,
        instance_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.course_enrollments import CourseEnrollment

        e = CourseEnrollment()
        e.id = enrollment_id or uuid.UUID("00000000-0000-0000-0000-000000000334")
        e.course_id = uuid.UUID("00000000-0000-0000-0000-000000000c00")
        e.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
        e.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        e.care_episode_id = None
        e.assigned_by = None
        e.enrollment_source = "self_enroll"
        e.approval_status = "auto_approved"
        e.approved_by = None
        e.progress = {}
        e.status = "enrolled"
        e.enrolled_at = datetime(2026, 3, 5, tzinfo=UTC)
        e.completed_at = None
        return e

    return _make


@pytest.fixture
def make_assessment() -> Any:
    def _make(
        *,
        assessment_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        title: str = "PHQ-9 抑郁筛查",
        status: str = "draft",
        is_active: bool = True,
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.assessments import Assessment

        a = Assessment()
        a.id = assessment_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
        a.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        a.title = title
        a.description = "测评描述"
        a.assessment_type = "screening"
        a.demographics = []
        a.blocks = []
        a.screening_rules = {}
        a.collect_mode = "anonymous"
        a.result_display = {}
        a.share_token = None
        a.allow_client_report = False
        a.status = status
        a.is_active = is_active
        a.created_by = uuid.UUID(_FAKE_USER_ID)
        a.deleted_at = None
        a.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        a.updated_at = datetime(2026, 4, 30, tzinfo=UTC)
        return a

    return _make


@pytest.fixture
def make_assessment_result() -> Any:
    def _make(
        *,
        result_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        assessment_id: uuid.UUID | None = None,
        total_score: float | None = 12,
    ) -> Any:
        from datetime import UTC, datetime
        from decimal import Decimal

        from app.db.models.assessment_results import AssessmentResult

        r = AssessmentResult()
        r.id = result_id or uuid.UUID("00000000-0000-0000-0000-000000000445")
        r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        r.assessment_id = assessment_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
        r.user_id = user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        r.care_episode_id = None
        r.demographic_data = {}
        r.answers = {}
        r.custom_answers = {}
        r.dimension_scores = {}
        r.total_score = Decimal(str(total_score)) if total_score is not None else None
        r.risk_level = None
        r.ai_interpretation = None
        r.client_visible = False
        r.recommendations = []
        r.ai_provenance = None
        r.batch_id = None
        r.created_by = None
        r.deleted_at = None
        r.created_at = datetime(2026, 4, 15, tzinfo=UTC)
        return r

    return _make
