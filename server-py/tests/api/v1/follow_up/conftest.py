"""
Follow-up API 测试共享 fixture (镜像 counseling / delivery 同 pattern)。

prefix: /api/orgs/{org_id}/follow-up → router (plans + reviews)

Fixtures:
  - mock_db                AsyncSession mock
  - setup_db_results       FIFO execute 返回
  - admin_org_client       已认证 + OrgContext(role='org_admin')
  - counselor_org_client   已认证 + OrgContext(role='counselor')
  - client_role_org_client 已认证 + OrgContext(role='client') — 写入应 403
  - make_plan / make_review / make_episode  ORM 实例工厂
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
def _follow_up_test_env(base_env: pytest.MonkeyPatch) -> None:
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
    from app.api.v1.follow_up import router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api/orgs/{org_id}/follow-up", tags=["follow-up"])
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
    from app.middleware.data_scope import DataScope, get_data_scope
    from app.middleware.org_context import get_org_context

    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="user@example.com",
        is_system_admin=False,
    )
    app.dependency_overrides[get_org_context] = lambda: _make_org_context(role, role_v2)
    # data_scope 默认 'all' 让 list_plans 不走 assigned 分支 (避免触发额外 join)
    app.dependency_overrides[get_data_scope] = lambda: DataScope(type="all")


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
def make_plan() -> Any:
    def _make(
        *,
        plan_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        care_episode_id: uuid.UUID | None = None,
        counselor_id: uuid.UUID | None = None,
        plan_type: str | None = "复评",
        frequency: str | None = "每月",
        status: str = "active",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.follow_up_plans import FollowUpPlan

        p = FollowUpPlan()
        p.id = plan_id or uuid.UUID("00000000-0000-0000-0000-000000000aaa")
        p.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
        p.care_episode_id = care_episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
        p.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
        p.plan_type = plan_type
        p.assessment_id = None
        p.frequency = frequency
        p.next_due = None
        p.status = status
        p.notes = None
        p.created_at = datetime(2026, 4, 1, tzinfo=UTC)
        return p

    return _make


@pytest.fixture
def make_review() -> Any:
    def _make(
        *,
        review_id: uuid.UUID | None = None,
        plan_id: uuid.UUID | None = None,
        care_episode_id: uuid.UUID | None = None,
        counselor_id: uuid.UUID | None = None,
        decision: str | None = "continue",
        risk_before: str | None = "level_1",
        risk_after: str | None = "level_1",
    ) -> Any:
        from datetime import UTC, datetime

        from app.db.models.follow_up_reviews import FollowUpReview

        r = FollowUpReview()
        r.id = review_id or uuid.UUID("00000000-0000-0000-0000-000000000bbb")
        r.plan_id = plan_id or uuid.UUID("00000000-0000-0000-0000-000000000aaa")
        r.care_episode_id = care_episode_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
        r.counselor_id = counselor_id or uuid.UUID(_FAKE_USER_ID)
        r.review_date = datetime(2026, 4, 15, tzinfo=UTC)
        r.result_id = None
        r.risk_before = risk_before
        r.risk_after = risk_after
        r.clinical_note = None
        r.decision = decision
        r.created_at = datetime(2026, 4, 15, tzinfo=UTC)
        return r

    return _make


@pytest.fixture
def make_episode() -> Any:
    def _make(
        *,
        episode_id: uuid.UUID | None = None,
        org_id: uuid.UUID | None = None,
        client_id: uuid.UUID | None = None,
        status: str = "active",
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
        e.chief_complaint = "焦虑"
        e.current_risk = current_risk
        e.intervention_type = None
        e.opened_at = datetime(2026, 1, 1, tzinfo=UTC)
        e.closed_at = None
        e.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        e.updated_at = datetime(2026, 4, 1, tzinfo=UTC)
        return e

    return _make
