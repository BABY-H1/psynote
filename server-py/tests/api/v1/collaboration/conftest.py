"""
Collaboration API 测试共享 fixture (镜像 follow_up / delivery 同 pattern)。

prefix: /api/orgs/{org_id}/collaboration → router (4-tab UI 一站式)
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
def _collab_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_mock_db()


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    return setup_db_results_factory(mock_db)


def _build_test_app() -> FastAPI:
    from app.api.v1.collaboration import router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        router,
        prefix="/api/orgs/{org_id}/collaboration",
        tags=["collaboration"],
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


# ─── ORM 实例工厂 ──────────────────────────────────────────────


@pytest.fixture
def make_session_note() -> Any:
    def _make(
        *,
        note_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        client_id: uuid.UUID | None = None,
        counselor_id: uuid.UUID | None = None,
        status: str = "submitted_for_review",
        supervisor_annotation: str | None = None,
    ) -> Any:
        from datetime import UTC, datetime
        from datetime import date as date_type

        from app.db.models.session_notes import SessionNote

        n = SessionNote()
        n.id = note_id or uuid.UUID("00000000-0000-0000-0000-000000000444")
        n.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        n.care_episode_id = uuid.UUID("00000000-0000-0000-0000-000000000111")
        n.appointment_id = None
        n.client_id = client_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
        n.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
        n.note_format = "soap"
        n.template_id = None
        n.session_date = date_type(2026, 4, 1)
        n.duration = 60
        n.session_type = None
        n.subjective = "S 内容"
        n.objective = None
        n.assessment = None
        n.plan = None
        n.fields = {}
        n.summary = "会谈摘要"
        n.tags = []
        n.status = status
        n.supervisor_annotation = supervisor_annotation
        n.submitted_for_review_at = datetime(2026, 4, 2, tzinfo=UTC)
        n.created_at = datetime(2026, 4, 1, tzinfo=UTC)
        n.updated_at = datetime(2026, 4, 2, tzinfo=UTC)
        return n

    return _make


@pytest.fixture
def make_audit_log() -> Any:
    def _make(
        *,
        log_id: uuid.UUID | None = None,
        action: str = "create",
        resource: str = "care_episodes",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.audit_logs import AuditLog

        a = AuditLog()
        a.id = log_id or uuid.UUID("00000000-0000-0000-0000-000000000ccc")
        a.org_id = uuid.UUID(_FAKE_ORG_ID)
        a.user_id = uuid.UUID(_FAKE_USER_ID)
        a.action = action
        a.resource = resource
        a.resource_id = uuid.UUID("00000000-0000-0000-0000-000000000111")
        a.changes = None
        a.ip_address = "127.0.0.1"
        a.created_at = datetime(2026, 4, 1, tzinfo=UTC)
        return a

    return _make


@pytest.fixture
def make_phi_access_log() -> Any:
    def _make(
        *,
        log_id: uuid.UUID | None = None,
        action: str = "view",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.phi_access_logs import PHIAccessLog

        p = PHIAccessLog()
        p.id = log_id or uuid.UUID("00000000-0000-0000-0000-000000000ddd")
        p.org_id = uuid.UUID(_FAKE_ORG_ID)
        p.user_id = uuid.UUID(_FAKE_USER_ID)
        p.client_id = uuid.UUID("00000000-0000-0000-0000-000000000010")
        p.resource = "care_episodes"
        p.resource_id = uuid.UUID("00000000-0000-0000-0000-000000000111")
        p.action = action
        p.reason = None
        p.data_class = "phi_full"
        p.actor_role_snapshot = "counselor"
        p.ip_address = "127.0.0.1"
        p.user_agent = "Mozilla/5.0"
        p.created_at = datetime(2026, 4, 1, tzinfo=UTC)
        return p

    return _make
