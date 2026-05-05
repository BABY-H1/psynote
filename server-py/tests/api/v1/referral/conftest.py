"""
Referral API 测试共享 fixture.

挂 router (auth) + public_router (no auth) 在同一 test app, 模拟生产路由结构:

  /api/orgs/{org_id}/referrals → router (auth)
  /api/public/referrals        → public_router (no auth, token-based)
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _referral_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_FAKE_REFERRAL_ID = "00000000-0000-0000-0000-000000000d01"
_FAKE_EPISODE_ID = "00000000-0000-0000-0000-000000000111"
_FAKE_CLIENT_ID = "00000000-0000-0000-0000-000000000010"


def _make_query_result(row: Any) -> MagicMock:
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
        items = [row] if row is not None else []
        result.all = MagicMock(return_value=items)
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=items)
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


def _build_referral_test_app() -> FastAPI:
    from app.api.v1.referral import public_router
    from app.api.v1.referral import router as referral_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(referral_router, prefix="/api/orgs/{org_id}/referrals", tags=["referral"])
    app.include_router(public_router, prefix="/api/public/referrals", tags=["referral-public"])
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_referral_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def public_client(test_app: FastAPI) -> TestClient:
    """无 auth — public_router 用."""
    return TestClient(test_app)


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


def _make_referral(
    *,
    referral_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    care_episode_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    referred_by: uuid.UUID | None = None,
    status: str = "pending",
    mode: str = "external",
    download_token: str | None = None,
    download_expires_at: datetime | None = None,
    data_package_spec: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.referrals import Referral

    r = Referral()
    r.id = referral_id or uuid.UUID(_FAKE_REFERRAL_ID)
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.care_episode_id = care_episode_id or uuid.UUID(_FAKE_EPISODE_ID)
    r.client_id = client_id or uuid.UUID(_FAKE_CLIENT_ID)
    r.referred_by = referred_by or uuid.UUID(_FAKE_USER_ID)
    r.reason = "建议外部转介"
    r.risk_summary = None
    r.target_type = None
    r.target_name = "三甲心理科"
    r.target_contact = None
    r.status = status
    r.follow_up_plan = None
    r.follow_up_notes = None
    r.mode = mode
    r.to_counselor_id = None
    r.to_org_id = None
    r.data_package_spec = data_package_spec or {}
    r.consented_at = None
    r.accepted_at = None
    r.rejected_at = None
    r.rejection_reason = None
    r.download_token = download_token
    r.download_expires_at = download_expires_at
    return r


@pytest.fixture
def make_referral() -> Any:
    return _make_referral


@pytest.fixture
def future_dt() -> datetime:
    return datetime.now(UTC) + timedelta(hours=1)


@pytest.fixture
def past_dt() -> datetime:
    return datetime.now(UTC) - timedelta(seconds=1)
