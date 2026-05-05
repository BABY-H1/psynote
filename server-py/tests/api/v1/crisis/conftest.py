"""
Crisis API 测试共享 fixture.

镜像 ``tests/api/v1/counseling/conftest.py`` 风格. 不接 ``app/main.py``
(按任务规则 Tier 4 不改 main), 在此 build test-only FastAPI app 挂上
crisis router + 标准 error_handler.

Fixtures:
  - mock_db AsyncSession mock
  - setup_db_results FIFO execute return queue
  - admin_org_client / counselor_org_client / client_role_org_client
  - make_crisis_case / make_candidate / make_org_member
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
def _crisis_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_FAKE_CASE_ID = "00000000-0000-0000-0000-000000000c01"
_FAKE_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_FAKE_CANDIDATE_ID = "00000000-0000-0000-0000-000000000c02"


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    return setup_db_results_factory(mock_db)


# ─── Test app builder ────────────────────────────────────────────


def _build_crisis_test_app() -> FastAPI:
    from app.api.v1.crisis import router as crisis_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(crisis_router, prefix="/api/orgs/{org_id}/crisis", tags=["crisis"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_crisis_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def fake_case_id() -> str:
    return _FAKE_CASE_ID


@pytest.fixture
def fake_episode_id() -> str:
    return _FAKE_EPISODE_ID


@pytest.fixture
def fake_candidate_id() -> str:
    return _FAKE_CANDIDATE_ID


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
        id=_FAKE_USER_ID, email="admin@example.com", is_system_admin=False
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
        id=_FAKE_USER_ID, email="counselor@example.com", is_system_admin=False
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
        id=_FAKE_USER_ID, email="client@example.com", is_system_admin=False
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


# ─── Factories ────────────────────────────────────────────────────


def _make_crisis_case(
    *,
    case_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    episode_id: uuid.UUID | None = None,
    candidate_id: uuid.UUID | None = None,
    stage: str = "open",
    checklist: dict[str, Any] | None = None,
    closure_summary: str | None = None,
    created_by: uuid.UUID | None = None,
) -> Any:
    from app.db.models.crisis_cases import CrisisCase

    c = CrisisCase()
    c.id = case_id or uuid.UUID(_FAKE_CASE_ID)
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.episode_id = episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    c.candidate_id = candidate_id
    c.stage = stage
    c.checklist = checklist or {}
    c.closure_summary = closure_summary
    c.supervisor_note = None
    c.signed_off_by = None
    c.signed_off_at = None
    c.submitted_for_sign_off_at = None
    c.created_by = created_by or uuid.UUID(_FAKE_USER_ID)
    return c


def _make_candidate(
    *,
    cand_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    kind: str = "crisis_candidate",
    status: str = "pending",
    client_user_id: uuid.UUID | None = None,
) -> Any:
    from app.db.models.candidate_pool import CandidatePool

    c = CandidatePool()
    c.id = cand_id or uuid.UUID(_FAKE_CANDIDATE_ID)
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.client_user_id = client_user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    c.kind = kind
    c.suggestion = "可能存在自伤风险"
    c.reason = "PHQ-9 第 9 题 = 3"
    c.priority = "high"
    c.source_rule_id = None
    c.status = status
    c.assigned_to_user_id = None
    c.handled_by_user_id = None
    c.handled_at = None
    c.handled_note = None
    c.resolved_ref_type = None
    c.resolved_ref_id = None
    c.target_group_instance_id = None
    c.target_course_instance_id = None
    return c


def _make_episode(
    *,
    episode_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    counselor_id: uuid.UUID | None = None,
    status: str = "active",
) -> Any:
    from app.db.models.care_episodes import CareEpisode

    e = CareEpisode()
    e.id = episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    e.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    e.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    e.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
    e.status = status
    e.chief_complaint = None
    e.current_risk = "level_4"
    e.intervention_type = "crisis"
    e.opened_at = None  # type: ignore[assignment]
    e.closed_at = None
    return e


@pytest.fixture
def make_crisis_case() -> Any:
    return _make_crisis_case


@pytest.fixture
def make_candidate() -> Any:
    return _make_candidate


@pytest.fixture
def make_episode() -> Any:
    return _make_episode
