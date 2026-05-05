"""Parent binding API 测试共享 fixture.

3 个 routers 各自独立挂在 test_app 不同 prefix:
  - admin_router         /api/orgs/{org_id}/school/classes/{class_id}/parent-invite-tokens
  - public_router        /api/public/parent-bind
  - portal_children_router /api/orgs/{org_id}/client/children
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
def _parent_binding_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


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


# ─── Test app ──────────────────────────────────────────────────


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_CLASS_ID = "00000000-0000-0000-0000-000000000022"


def _build_test_app() -> FastAPI:
    from app.api.v1.parent_binding import (
        admin_router,
        portal_children_router,
        public_router,
    )
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        admin_router,
        prefix="/api/orgs/{org_id}/school/classes/{class_id}/parent-invite-tokens",
        tags=["parent-binding"],
    )
    app.include_router(
        public_router,
        prefix="/api/public/parent-bind",
        tags=["parent-binding-public"],
    )
    app.include_router(
        portal_children_router,
        prefix="/api/orgs/{org_id}/client/children",
        tags=["parent-binding-portal"],
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
    """无认证 — 用于公开 parent-bind 端点."""
    return TestClient(test_app)


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def fake_class_id() -> str:
    return _CLASS_ID


def _make_org_context(role: str = "counselor", role_v2: str = "counselor") -> Any:
    from app.middleware.org_context import LicenseInfo, OrgContext

    return OrgContext(
        org_id=_FAKE_ORG_ID,
        org_type="school",
        role=role,
        role_v2=role_v2,
        member_id="member-x",
        full_practice_access=False,
        tier="starter",
        license=LicenseInfo(status="none"),
    )


@pytest.fixture
def counselor_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """counselor + 学校 OrgContext."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="t@school.com",
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
def admin_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """org_admin + 学校 OrgContext."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="admin@school.com",
        is_system_admin=False,
    )
    test_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="org_admin", role_v2="school_admin"
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)
        test_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def client_role_org_client(test_app: FastAPI) -> Iterator[TestClient]:
    """legacy role='client' — 用于 admin endpoint 403 验证 + portal 端点测试."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="parent@school.com",
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


# ─── Factory helpers ──────────────────────────────────────────


def _make_token_row(
    *,
    tid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    class_id: uuid.UUID | None = None,
    token: str = "test-token-base64url-XXXX",
    revoked: bool = False,
    expired: bool = False,
) -> Any:
    from datetime import UTC, datetime, timedelta

    from app.db.models.class_parent_invite_tokens import ClassParentInviteToken

    t = ClassParentInviteToken()
    t.id = tid or uuid.UUID("00000000-0000-0000-0000-000000000111")
    t.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    t.class_id = class_id or uuid.UUID(_CLASS_ID)
    t.token = token
    t.created_by = uuid.UUID(_FAKE_USER_ID)
    if expired:
        t.expires_at = datetime.now(UTC) - timedelta(days=1)
    else:
        t.expires_at = datetime.now(UTC) + timedelta(days=30)
    t.revoked_at = datetime.now(UTC) if revoked else None
    return t


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
    r.id = rel_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.holder_user_id = holder or uuid.UUID(_FAKE_USER_ID)
    r.related_client_user_id = related or uuid.UUID("00000000-0000-0000-0000-000000000003")
    r.relation = relation
    r.status = status_
    r.bound_via_token_id = None
    r.accepted_at = datetime(2026, 5, 1, tzinfo=UTC)
    r.revoked_at = None
    return r


@pytest.fixture
def make_token_row() -> Any:
    return _make_token_row


@pytest.fixture
def make_relationship() -> Any:
    return _make_relationship
