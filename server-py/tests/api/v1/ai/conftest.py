"""
AI module tests 共享 fixtures — TestClient + mock DB + 角色 fixtures。

风格与 ``tests/api/v1/counseling/conftest.py`` 一致。
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
def _ai_test_env(base_env: pytest.MonkeyPatch) -> None:
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
    db.delete = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
_FAKE_CRED_ID = "00000000-0000-0000-0000-000000000aaa"


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


def _build_ai_test_app() -> FastAPI:
    """挂上 AI 主 router + ai_credentials 两个 router."""
    from app.api.v1.ai import router as ai_router
    from app.api.v1.ai_credentials import org_router as creds_org_router
    from app.api.v1.ai_credentials import system_router as creds_system_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(ai_router, prefix="/api/orgs/{org_id}/ai", tags=["ai"])
    app.include_router(
        creds_org_router,
        prefix="/api/orgs/{org_id}/ai-credentials",
        tags=["ai-credentials"],
    )
    app.include_router(
        creds_system_router, prefix="/api/ai-credentials", tags=["ai-credentials-system"]
    )
    return app


@pytest.fixture
def test_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_ai_test_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


@pytest.fixture
def fake_cred_id() -> str:
    return _FAKE_CRED_ID


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


@pytest.fixture
def sysadmin_client(test_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user

    test_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="sa@example.com", is_system_admin=True
    )
    try:
        yield TestClient(test_app)
    finally:
        test_app.dependency_overrides.pop(get_current_user, None)


# ── 工厂 helper: ai_credential ORM ─────────────────────────


def _make_credential(
    *,
    cred_id: uuid.UUID | None = None,
    scope: str = "org",
    scope_id: uuid.UUID | None = None,
    provider: str = "openai-compatible",
    base_url: str = "https://api.openai.com",
    model: str = "gpt-4o",
    plaintext_key: str = "sk-test-fixture-key",
    data_residency: str = "cn",
    is_default: bool = True,
    is_disabled: bool = False,
    label: str | None = None,
) -> Any:
    """构造真带加密 key 的 AICredential ORM 实例 (resolver 解密能跑通)."""
    from app.db.models.ai_credentials import AICredential
    from app.lib.crypto import encrypt

    c = AICredential()
    c.id = cred_id or uuid.UUID(_FAKE_CRED_ID)
    c.scope = scope
    if scope_id is None and scope == "org":
        scope_id = uuid.UUID(_FAKE_ORG_ID)
    c.scope_id = scope_id
    c.provider = provider
    c.base_url = base_url
    c.model = model

    # 真用 crypto 加密 — AAD 必须匹配 (scope, scope_id) 才能后续 decrypt 成功
    sid_for_aad = str(scope_id) if scope_id else None
    enc, iv, tag = encrypt(plaintext_key, scope, sid_for_aad)
    c.encrypted_key = enc
    c.encryption_iv = iv
    c.encryption_tag = tag

    c.data_residency = data_residency
    c.is_default = is_default
    c.is_disabled = is_disabled
    c.label = label
    c.created_by = uuid.UUID(_FAKE_USER_ID)
    c.rotated_at = None
    c.last_used_at = None
    c.last_error_at = None
    return c


@pytest.fixture
def make_credential() -> Any:
    return _make_credential


def _make_organization(
    *,
    org_id: uuid.UUID | None = None,
    settings: dict[str, Any] | None = None,
) -> Any:
    from app.db.models.organizations import Organization

    o = Organization()
    o.id = org_id or uuid.UUID(_FAKE_ORG_ID)
    o.name = "Test Org"
    o.slug = "test"
    o.plan = "free"
    o.license_key = None
    o.settings = settings or {}
    o.triage_config = {}
    o.data_retention_policy = {}
    o.parent_org_id = None
    o.org_level = "leaf"
    return o


@pytest.fixture
def make_organization() -> Any:
    return _make_organization
