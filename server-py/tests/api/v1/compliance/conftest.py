"""
Compliance API 测试共享 fixture.

挂 review_router + consent_router. 两个 router 共用 ``/api/orgs/{org_id}/`` prefix 但
review 子路径是 ``/compliance/...``, consent 子路径是 ``/consent-templates`` /
``/consent-documents``。
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC
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
def _compliance_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_FAKE_TEMPLATE_ID = "00000000-0000-0000-0000-000000000e01"
_FAKE_DOC_ID = "00000000-0000-0000-0000-000000000e02"
_FAKE_REVIEW_ID = "00000000-0000-0000-0000-000000000e03"
_FAKE_NOTE_ID = "00000000-0000-0000-0000-000000000e04"
_FAKE_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_FAKE_CLIENT_ID = "00000000-0000-0000-0000-000000000010"


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    return setup_db_results_factory(mock_db)


# ─── Test app ─────────────────────────────────────────────────────


def _build_compliance_test_app() -> FastAPI:
    from app.api.v1.compliance import consent_router, review_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(review_router, prefix="/api/orgs/{org_id}/compliance", tags=["compliance"])
    app.include_router(consent_router, prefix="/api/orgs/{org_id}", tags=["compliance"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_compliance_test_app()
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


@pytest.fixture
def authed_client(test_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="user@example.com", is_system_admin=False
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def admin_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import DataScope, get_data_scope
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="admin@example.com", is_system_admin=False
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    test_app.dependency_overrides[get_data_scope] = lambda: DataScope(type="all")
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)
        test_app.dependency_overrides.pop(get_data_scope, None)


@pytest.fixture
def counselor_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import DataScope, get_data_scope
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="counselor@example.com", is_system_admin=False
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor"
    )
    test_app.dependency_overrides[get_data_scope] = lambda: DataScope(type="all")
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)
        test_app.dependency_overrides.pop(get_data_scope, None)


@pytest.fixture
def client_role_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import DataScope, get_data_scope
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="client@example.com", is_system_admin=False
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    test_app.dependency_overrides[get_data_scope] = lambda: DataScope(type="none")
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)
        test_app.dependency_overrides.pop(get_data_scope, None)


# ─── Factories ────────────────────────────────────────────────────


def _make_consent_template(
    *,
    template_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "心理咨询知情同意书",
    consent_type: str = "treatment",
) -> Any:
    from app.db.models.consent_templates import ConsentTemplate

    t = ConsentTemplate()
    t.id = template_id or uuid.UUID(_FAKE_TEMPLATE_ID)
    t.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    t.title = title
    t.consent_type = consent_type
    t.content = "本同意书的全文..."
    t.visibility = "personal"
    t.allowed_org_ids = []
    t.created_by = uuid.UUID(_FAKE_USER_ID)
    return t


def _make_client_doc(
    *,
    doc_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    template_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    recipient_type: str = "client",
    recipient_name: str | None = None,
    status: str = "pending",
    consent_type: str | None = "treatment",
) -> Any:
    from app.db.models.client_documents import ClientDocument

    d = ClientDocument()
    d.id = doc_id or uuid.UUID(_FAKE_DOC_ID)
    d.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    d.client_id = client_id or uuid.UUID(_FAKE_CLIENT_ID)
    d.care_episode_id = care_episode_id
    d.template_id = template_id or uuid.UUID(_FAKE_TEMPLATE_ID)
    d.title = "知情同意书"
    d.content = "正文"
    d.doc_type = "consent"
    d.consent_type = consent_type
    d.recipient_type = recipient_type
    d.recipient_name = recipient_name
    d.status = status
    d.signed_at = None
    d.signature_data = None
    d.file_path = None
    d.created_by = uuid.UUID(_FAKE_USER_ID)
    return d


def _make_session_note(
    *,
    note_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
) -> Any:
    from datetime import date

    from app.db.models.session_notes import SessionNote

    n = SessionNote()
    n.id = note_id or uuid.UUID(_FAKE_NOTE_ID)
    n.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    n.care_episode_id = care_episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    n.appointment_id = None
    n.client_id = client_id or uuid.UUID(_FAKE_CLIENT_ID)
    n.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    n.note_format = "soap"
    n.template_id = None
    n.session_date = date(2026, 1, 1)
    n.duration = None
    n.session_type = None
    n.subjective = "S"
    n.objective = "O"
    n.assessment = "A"
    n.plan = "P"
    n.fields = {}
    n.summary = None
    n.tags = []
    n.status = "draft"
    n.supervisor_annotation = None
    n.submitted_for_review_at = None
    return n


def _make_treatment_plan(
    *,
    plan_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    status: str = "active",
) -> Any:
    from app.db.models.treatment_plans import TreatmentPlan

    p = TreatmentPlan()
    p.id = plan_id or uuid.UUID("00000000-0000-0000-0000-000000000666")
    p.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    p.care_episode_id = care_episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    p.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    p.status = status
    p.title = "Plan"
    p.approach = None
    p.goals = []
    p.interventions = []
    p.session_plan = None
    p.progress_notes = None
    p.review_date = None
    return p


def _make_compliance_review(
    *,
    review_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    note_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    review_type: str = "note_compliance",
) -> Any:
    from datetime import datetime

    from app.db.models.compliance_reviews import ComplianceReview

    r = ComplianceReview()
    r.id = review_id or uuid.UUID(_FAKE_REVIEW_ID)
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.care_episode_id = care_episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    r.note_id = note_id
    r.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    r.review_type = review_type
    r.score = None
    r.findings = []
    r.golden_thread_score = None
    r.quality_indicators = {}
    r.reviewed_at = datetime.now(UTC)
    r.reviewed_by = "ai"
    return r


@pytest.fixture
def make_consent_template() -> Any:
    return _make_consent_template


@pytest.fixture
def make_client_doc() -> Any:
    return _make_client_doc


@pytest.fixture
def make_session_note() -> Any:
    return _make_session_note


@pytest.fixture
def make_treatment_plan() -> Any:
    return _make_treatment_plan


@pytest.fixture
def make_compliance_review() -> Any:
    return _make_compliance_review
