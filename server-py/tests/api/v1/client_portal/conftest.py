"""Client portal API 测试共享 fixture.

镜像 ``tests/api/v1/group/conftest.py`` 的 mock_db / setup_db_results / 已认证 +
OrgContext 注入模式. 各 sub-router 通过本地 test_app 挂在
``/api/orgs/{org_id}/client`` prefix 下 (与生产对齐).

设计要点:
  - 所有 client portal 端点都需 ``get_current_user`` + ``get_org_context``;
    默认 fixture 提供 ``client_role_org_client`` (legacy role='client') —
    portal 主用户群.
  - holder + child user_id 常量, 覆盖监护人代查 (?as=) 测试.
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
def _client_portal_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    return setup_db_results_factory(mock_db)


# ─── Test app ──────────────────────────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CHILD_USER_ID = "00000000-0000-0000-0000-000000000002"


def _build_test_app() -> FastAPI:
    """build 一个 test-only FastAPI app, 挂 client_portal.router 在
    ``/api/orgs/{org_id}/client`` prefix.
    """
    from app.api.v1.client_portal import router as client_portal_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        client_portal_router,
        prefix="/api/orgs/{org_id}/client",
        tags=["client-portal"],
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


@pytest.fixture
def client(test_app: FastAPI) -> TestClient:
    return TestClient(test_app)


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def child_user_id() -> str:
    return _CHILD_USER_ID


def _make_org_context(role: str = "client", role_v2: str = "client") -> Any:
    from app.middleware.org_context import LicenseInfo, OrgContext

    return OrgContext(
        org_id=_FAKE_ORG_ID,
        org_type="counseling",
        role=role,
        role_v2=role_v2,
        member_id="member-x",
        full_practice_access=False,
        tier="starter",
        license=LicenseInfo(status="none"),
    )


@pytest.fixture
def client_role_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext(role='client'). 默认 portal 用户."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="user@example.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


# ─── Factory helpers ──────────────────────────────────────────


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = "u@example.com",
    name: str = "User",
) -> Any:
    from app.db.models.users import User

    u = User()
    u.id = user_id or uuid.UUID(_FAKE_USER_ID)
    u.email = email
    u.name = name
    u.password_hash = None
    u.avatar_url = None
    u.is_system_admin = False
    return u


def _make_episode(
    *,
    ep_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_: str = "active",
) -> Any:
    from app.db.models.care_episodes import CareEpisode

    e = CareEpisode()
    e.id = ep_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    e.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    e.client_id = client_id or uuid.UUID(_FAKE_USER_ID)
    e.counselor_id = None
    e.status = status_
    e.chief_complaint = None
    e.current_risk = "level_1"
    e.intervention_type = None
    # opened_at: server_default 在 flush 才生效, 测试 mock 不走 DB; 给 sentinel
    from datetime import UTC
    from datetime import datetime as _dt

    e.opened_at = _dt(2026, 5, 1, tzinfo=UTC)
    e.closed_at = None
    return e


def _make_appointment(
    *,
    appt_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    status_: str = "confirmed",
) -> Any:
    from datetime import UTC, datetime

    from app.db.models.appointments import Appointment

    a = Appointment()
    a.id = appt_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    a.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    a.care_episode_id = None
    a.client_id = client_id or uuid.UUID(_FAKE_USER_ID)
    a.counselor_id = counselor_id or uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    a.start_time = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)
    a.end_time = datetime(2026, 6, 1, 11, 0, tzinfo=UTC)
    a.status = status_
    a.type = "online"
    a.source = None
    a.notes = None
    a.reminder_sent_24h = False
    a.reminder_sent_1h = False
    a.client_confirmed_at = None
    a.confirm_token = None
    return a


def _make_result(
    *,
    rid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    assessment_id: uuid.UUID | None = None,
    client_visible: bool = True,
) -> Any:
    from app.db.models.assessment_results import AssessmentResult

    r = AssessmentResult()
    r.id = rid or uuid.UUID("00000000-0000-0000-0000-000000000333")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.user_id = user_id or uuid.UUID(_FAKE_USER_ID)
    r.care_episode_id = None
    r.assessment_id = assessment_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
    r.demographic_data = {}
    r.answers = {"q1": 1}
    r.custom_answers = {}
    r.dimension_scores = {}
    r.total_score = None
    r.risk_level = None
    r.ai_interpretation = None
    r.client_visible = client_visible
    r.recommendations = []
    r.ai_provenance = None
    r.batch_id = None
    r.created_by = None
    r.deleted_at = None
    return r


def _make_relationship(
    *,
    rel_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    holder: uuid.UUID | None = None,
    related: uuid.UUID | None = None,
    relation: str = "father",
    status_: str = "active",
) -> Any:
    from datetime import UTC, datetime

    from app.db.models.client_relationships import ClientRelationship

    r = ClientRelationship()
    r.id = rel_id or uuid.UUID("00000000-0000-0000-0000-000000000555")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.holder_user_id = holder or uuid.UUID(_FAKE_USER_ID)
    r.related_client_user_id = related or uuid.UUID(_CHILD_USER_ID)
    r.relation = relation
    r.status = status_
    r.bound_via_token_id = None
    r.accepted_at = datetime(2026, 5, 1, tzinfo=UTC)
    r.revoked_at = None
    return r


def _make_document(
    *,
    doc_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_: str = "pending",
) -> Any:
    from app.db.models.client_documents import ClientDocument

    d = ClientDocument()
    d.id = doc_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    d.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    d.client_id = client_id or uuid.UUID(_FAKE_USER_ID)
    d.care_episode_id = None
    d.template_id = None
    d.title = "Doc"
    d.content = "..."
    d.doc_type = "consent"
    d.consent_type = "treatment"
    d.recipient_type = "client"
    d.recipient_name = None
    d.status = status_
    d.signed_at = None
    d.signature_data = None
    d.file_path = None
    d.created_by = None
    return d


def _make_consent(
    *,
    cid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_: str = "active",
) -> Any:
    from app.db.models.consent_records import ConsentRecord

    c = ConsentRecord()
    c.id = cid or uuid.UUID("00000000-0000-0000-0000-000000000777")
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.client_id = client_id or uuid.UUID(_FAKE_USER_ID)
    c.consent_type = "treatment"
    c.scope = {}
    c.granted_at = None
    c.revoked_at = None
    c.expires_at = None
    c.document_id = None
    c.signer_on_behalf_of = None
    c.status = status_
    return c


def _make_referral(
    *,
    ref_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_: str = "pending",
) -> Any:
    from app.db.models.referrals import Referral

    r = Referral()
    r.id = ref_id or uuid.UUID("00000000-0000-0000-0000-000000000888")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.care_episode_id = uuid.UUID("00000000-0000-0000-0000-000000000aaa")
    r.client_id = client_id or uuid.UUID(_FAKE_USER_ID)
    r.referred_by = uuid.UUID("00000000-0000-0000-0000-000000000bbb")
    r.reason = "..."
    r.risk_summary = None
    r.target_type = None
    r.target_name = None
    r.target_contact = None
    r.status = status_
    r.follow_up_plan = None
    r.follow_up_notes = None
    r.mode = "external"
    r.to_counselor_id = None
    r.to_org_id = None
    r.data_package_spec = {}
    r.consented_at = None
    r.accepted_at = None
    r.rejected_at = None
    r.rejection_reason = None
    r.download_token = None
    r.download_expires_at = None
    return r


def _make_group_instance(
    *,
    inst_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "G",
    status_: str = "recruiting",
    capacity: int | None = 10,
    scheme_id: uuid.UUID | None = None,
    assessment_config: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.group_instances import GroupInstance

    i = GroupInstance()
    i.id = inst_id or uuid.UUID("00000000-0000-0000-0000-000000000ccc")
    i.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    i.scheme_id = scheme_id
    i.title = title
    i.description = None
    i.category = None
    i.leader_id = None
    i.schedule = None
    i.duration = None
    i.start_date = None
    i.location = None
    i.status = status_
    i.capacity = capacity
    i.recruitment_assessments = []
    i.overall_assessments = []
    i.screening_notes = None
    i.assessment_config = assessment_config or {}
    i.created_by = None
    return i


def _make_group_enrollment(
    *,
    enr_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    status_: str = "approved",
) -> Any:
    from app.db.models.group_enrollments import GroupEnrollment

    e = GroupEnrollment()
    e.id = enr_id or uuid.UUID("00000000-0000-0000-0000-000000000ddd")
    e.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000ccc")
    e.user_id = user_id or uuid.UUID(_FAKE_USER_ID)
    e.care_episode_id = None
    e.status = status_
    e.screening_result_id = None
    e.enrolled_at = None
    return e


def _make_session_record(
    *,
    rec_id: uuid.UUID | None = None,
    instance_id: uuid.UUID | None = None,
    session_number: int = 1,
    status_: str = "planned",
) -> Any:
    from app.db.models.group_session_records import GroupSessionRecord

    r = GroupSessionRecord()
    r.id = rec_id or uuid.UUID("00000000-0000-0000-0000-000000000eee")
    r.instance_id = instance_id or uuid.UUID("00000000-0000-0000-0000-000000000ccc")
    r.scheme_session_id = None
    r.session_number = session_number
    r.title = f"Session {session_number}"
    r.date = None
    r.status = status_
    r.notes = None
    return r


def _make_attendance(
    *,
    a_id: uuid.UUID | None = None,
    rec_id: uuid.UUID | None = None,
    enr_id: uuid.UUID | None = None,
    status_: str = "present",
) -> Any:
    from app.db.models.group_session_attendance import GroupSessionAttendance

    a = GroupSessionAttendance()
    a.id = a_id or uuid.UUID("00000000-0000-0000-0000-000000000fff")
    a.session_record_id = rec_id or uuid.UUID("00000000-0000-0000-0000-000000000eee")
    a.enrollment_id = enr_id or uuid.UUID("00000000-0000-0000-0000-000000000ddd")
    a.status = status_
    a.note = None
    return a


def _make_course(
    *,
    course_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "C",
    status_: str = "published",
) -> Any:
    from app.db.models.courses import Course

    c = Course()
    c.id = course_id or uuid.UUID("00000000-0000-0000-0000-0000000000c1")
    c.org_id = org_id
    c.title = title
    c.description = None
    c.category = None
    c.cover_url = None
    c.duration = None
    c.is_public = False
    c.status = status_
    c.creation_mode = "manual"
    c.course_type = None
    c.target_audience = None
    c.scenario = None
    c.responsible_id = None
    c.is_template = False
    c.source_template_id = None
    c.requirements_config = {}
    c.blueprint_data = {}
    c.tags = []
    c.allowed_org_ids = []
    c.created_by = None
    return c


def _make_course_enrollment(
    *,
    enr_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
) -> Any:
    from datetime import UTC, datetime

    from app.db.models.course_enrollments import CourseEnrollment

    e = CourseEnrollment()
    e.id = enr_id or uuid.UUID("00000000-0000-0000-0000-0000000000c2")
    e.course_id = course_id or uuid.UUID("00000000-0000-0000-0000-0000000000c1")
    e.instance_id = None
    e.user_id = user_id or uuid.UUID(_FAKE_USER_ID)
    e.care_episode_id = None
    e.assigned_by = None
    e.enrollment_source = "self_enroll"
    e.approval_status = "auto_approved"
    e.approved_by = None
    e.progress = {}
    e.status = "enrolled"
    e.enrolled_at = datetime(2026, 5, 1, tzinfo=UTC)
    e.completed_at = None
    return e


@pytest.fixture
def make_user_row() -> Any:
    return _make_user_row


@pytest.fixture
def make_episode() -> Any:
    return _make_episode


@pytest.fixture
def make_appointment() -> Any:
    return _make_appointment


@pytest.fixture
def make_result() -> Any:
    return _make_result


@pytest.fixture
def make_relationship() -> Any:
    return _make_relationship


@pytest.fixture
def make_document() -> Any:
    return _make_document


@pytest.fixture
def make_consent() -> Any:
    return _make_consent


@pytest.fixture
def make_referral() -> Any:
    return _make_referral


@pytest.fixture
def make_group_instance() -> Any:
    return _make_group_instance


@pytest.fixture
def make_group_enrollment() -> Any:
    return _make_group_enrollment


@pytest.fixture
def make_session_record() -> Any:
    return _make_session_record


@pytest.fixture
def make_attendance() -> Any:
    return _make_attendance


@pytest.fixture
def make_course() -> Any:
    return _make_course


@pytest.fixture
def make_course_enrollment() -> Any:
    return _make_course_enrollment
