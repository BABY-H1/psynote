"""
Workflow API 测试共享 fixture (Phase 3 Tier 4).

镜像 ``tests/api/v1/assessment/conftest.py`` 风格 — local FastAPI app + AsyncMock db
+ FIFO ``setup_db_results``. 任务规则要求不改 main.py, 这里 conftest 内 build
test-only app 挂上 workflow router.

Fixtures:
  - ``mock_db``: AsyncSession mock (含 add 自动分配 UUID 模拟 server_default=gen_random_uuid)
  - ``setup_db_results``: FIFO ``execute`` 返回, 每条 row 自动包成 mock Result
  - ``client`` 无认证 (用于 401 路径)
  - ``admin_client`` 已认证 + OrgContext(org_admin)
  - ``counselor_client`` 已认证 + OrgContext(counselor)
  - ``client_role_client`` 已认证 + OrgContext(legacy role='client') — rejectClient 验证
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
_FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"


class SetupDbResults(Protocol):
    def __call__(self, rows: list[Any]) -> None: ...


@pytest.fixture(autouse=True)
def _workflow_test_env(base_env: pytest.MonkeyPatch) -> None:
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result, 兼容多种消费形式."""
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

    import contextlib

    def _add_with_id(obj: Any) -> None:
        """模拟 server_default=gen_random_uuid: 给新 ORM 对象 id 字段赋一个 UUID."""
        if hasattr(obj, "id") and (obj.id is None or not isinstance(obj.id, uuid.UUID)):
            with contextlib.suppress(Exception):
                obj.id = uuid.uuid4()

    db.add = MagicMock(side_effect=_add_with_id)

    def _add_all(objs: Any) -> None:
        for o in objs:
            _add_with_id(o)

    db.add_all = MagicMock(side_effect=_add_all)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


# ─── 本地 FastAPI app ────────────────────────────────────────


def _build_workflow_app() -> FastAPI:
    """造一个独立 FastAPI app, 挂 workflow router (prefix 与未来 main.py 对齐)."""
    from app.api.v1.workflow import router as workflow_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        workflow_router,
        prefix="/api/orgs/{org_id}/workflow",
        tags=["workflow"],
    )
    return app


@pytest.fixture
def workflow_app(mock_db: AsyncMock) -> Iterator[FastAPI]:
    from app.core.database import get_db

    app = _build_workflow_app()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(workflow_app: FastAPI) -> TestClient:
    """无认证 TestClient (验证 401 路径)."""
    return TestClient(workflow_app)


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
def admin_client(workflow_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    workflow_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="admin@example.com", is_system_admin=False
    )
    workflow_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    try:
        yield TestClient(workflow_app)
    finally:
        workflow_app.dependency_overrides.pop(get_current_user, None)
        workflow_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def counselor_client(workflow_app: FastAPI) -> Iterator[TestClient]:
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    workflow_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="counselor@example.com", is_system_admin=False
    )
    workflow_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor"
    )
    try:
        yield TestClient(workflow_app)
    finally:
        workflow_app.dependency_overrides.pop(get_current_user, None)
        workflow_app.dependency_overrides.pop(get_org_context, None)


@pytest.fixture
def client_role_client(workflow_app: FastAPI) -> Iterator[TestClient]:
    """legacy role='client' — 用于 mutation 拒绝路径."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.org_context import get_org_context

    workflow_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID, email="client@example.com", is_system_admin=False
    )
    workflow_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    try:
        yield TestClient(workflow_app)
    finally:
        workflow_app.dependency_overrides.pop(get_current_user, None)
        workflow_app.dependency_overrides.pop(get_org_context, None)


# ─── 工厂 helpers ──────────────────────────────────────────


def _make_rule(
    *,
    rule_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    name: str = "Test Rule",
    is_active: bool = True,
    scope_assessment_id: uuid.UUID | None = None,
    source: str = "manual",
    trigger_event: str = "assessment_result.created",
) -> Any:
    from app.db.models.workflow_rules import WorkflowRule

    r = WorkflowRule()
    r.id = rule_id or uuid.UUID("00000000-0000-0000-0000-000000000111")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.scope_assessment_id = scope_assessment_id
    r.name = name
    r.description = None
    r.trigger_event = trigger_event
    r.conditions = []
    r.actions = []
    r.is_active = is_active
    r.priority = 0
    r.source = source
    r.created_by = uuid.UUID(_FAKE_USER_ID)
    r.created_at = None  # type: ignore[assignment]
    r.updated_at = None  # type: ignore[assignment]
    return r


def _make_candidate(
    *,
    cand_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    client_user_id: uuid.UUID | None = None,
    kind: str = "episode_candidate",
    status: str = "pending",
    suggestion: str = "Test suggestion",
    priority: str = "normal",
) -> Any:
    from app.db.models.candidate_pool import CandidatePool

    c = CandidatePool()
    c.id = cand_id or uuid.UUID("00000000-0000-0000-0000-000000000222")
    c.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    c.client_user_id = client_user_id or uuid.UUID("00000000-0000-0000-0000-000000000010")
    c.kind = kind
    c.suggestion = suggestion
    c.reason = None
    c.priority = priority
    c.source_rule_id = None
    c.source_result_id = None
    c.source_payload = None
    c.status = status
    c.assigned_to_user_id = None
    c.handled_by_user_id = None
    c.handled_at = None
    c.handled_note = None
    c.resolved_ref_type = None
    c.resolved_ref_id = None
    c.target_group_instance_id = None
    c.target_course_instance_id = None
    c.created_at = None  # type: ignore[assignment]
    return c


def _make_execution(
    *,
    exec_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    rule_id: uuid.UUID | None = None,
    status: str = "success",
    matched: bool = True,
) -> Any:
    from app.db.models.workflow_executions import WorkflowExecution

    e = WorkflowExecution()
    e.id = exec_id or uuid.UUID("00000000-0000-0000-0000-000000000333")
    e.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    e.rule_id = rule_id
    e.trigger_event = "assessment_result.created"
    e.event_payload = {}
    e.conditions_matched = matched
    e.actions_result = []
    e.status = status
    e.error_message = None
    e.created_at = None  # type: ignore[assignment]
    return e


@pytest.fixture
def make_rule() -> Any:
    return _make_rule


@pytest.fixture
def make_candidate() -> Any:
    return _make_candidate


@pytest.fixture
def make_execution() -> Any:
    return _make_execution
