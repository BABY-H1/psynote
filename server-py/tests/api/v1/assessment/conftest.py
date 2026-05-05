"""
Assessment API 测试共享 fixture (Phase 3 Tier 2).

注: ``app/main.py`` 当前未挂 assessment routers (Tier 2 总并入 ticket), 我们
在 conftest 里直接构造一个本地 FastAPI app, 把 7 个 router 用 prefix 挂上 +
``register_error_handlers``, 与 main.py 行为一致. 这样测试不依赖修改 main.py.

设计要点 (与 ``tests/api/v1/org/conftest.py`` 风格对齐):
  - autouse ``_assessment_test_env`` — 让 Settings() 可构造.
  - ``mock_db``: AsyncMock + sync ``add`` + ``flush`` (FIFO via ``setup_db_results``).
  - ``setup_db_results``: helper 配 ``db.execute`` FIFO side_effect; 与 org/auth 一致.
  - 7 fixture 提供不同身份的 TestClient:
      * ``client``                   — 无认证 (用于公开 ``/api/public/assessments``)
      * ``staff_client``             — 已认证 + counselor OrgContext (默认普通 staff,
                                       走 GET 端点)
      * ``admin_client``             — 已认证 + org_admin OrgContext (admin 守门通过)
      * ``client_role_client``       — 已认证 + 'client' legacy role (rejectClient 测试)
      * ``unauthed_client``          — 无认证 (验证 401 路径)
      * ``self_user_client``         — 已认证 + counselor OrgContext, user.id 与 result.user_id
                                       一致 (跳过 phi_access)
  - ``record_phi_access_calls`` — monkeypatch result_router 模块的 record_phi_access,
    捕获调用 args. 测试 assert 出现/不出现 phi log 写入.
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
def _assessment_test_env(base_env: pytest.MonkeyPatch) -> None:
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

    # mock add: 给新插入的 ORM 对象自动分配 UUID id (模拟 server_default=gen_random_uuid).
    # 真实 SQLAlchemy 会在 flush() 时由 DB 回填; mock 模式下我们在 add() 时立刻给一个,
    # 让 router 后续的 ``str(obj.id)`` / ``await get_assessment(..., str(a.id), ...)`` 能跑.
    import contextlib

    def _add_with_id(obj: Any) -> None:
        if hasattr(obj, "id") and (obj.id is None or not isinstance(obj.id, uuid.UUID)):
            # 一些 ORM 对象的 id 列不可写, 用 suppress 忽略 setter 异常
            with contextlib.suppress(Exception):
                obj.id = uuid.uuid4()

    db.add = MagicMock(side_effect=_add_with_id)
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


# ─── 本地 FastAPI app (assessment routers + error handler) ──────


def _build_assessment_app() -> FastAPI:
    """造一个独立 FastAPI app, 挂 assessment 7 个 router (prefix 与未来 main.py 对齐)."""
    from app.api.v1.assessment import (
        batch_router,
        distribution_router,
        public_result_router,
        report_router,
        result_router,
        scale_router,
    )
    from app.api.v1.assessment import router as assessment_router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)

    app.include_router(
        assessment_router,
        prefix="/api/orgs/{org_id}/assessments",
        tags=["assessment"],
    )
    app.include_router(
        scale_router,
        prefix="/api/orgs/{org_id}/scales",
        tags=["scale"],
    )
    app.include_router(
        batch_router,
        prefix="/api/orgs/{org_id}/assessment-batches",
        tags=["assessment-batch"],
    )
    app.include_router(
        distribution_router,
        prefix="/api/orgs/{org_id}/assessments/{assessment_id}/distributions",
        tags=["assessment-distribution"],
    )
    app.include_router(
        report_router,
        prefix="/api/orgs/{org_id}/assessment-reports",
        tags=["assessment-report"],
    )
    app.include_router(
        result_router,
        prefix="/api/orgs/{org_id}/assessment-results",
        tags=["assessment-result"],
    )
    app.include_router(
        public_result_router,
        prefix="/api/public/assessments",
        tags=["assessment-public"],
    )
    return app


@pytest.fixture
def assessment_app() -> FastAPI:
    """共享 app 实例 (lru_cache 不必, 每个测试新建保 dependency_overrides 干净)."""
    return _build_assessment_app()


@pytest.fixture
def client(assessment_app: FastAPI, mock_db: AsyncMock) -> Iterator[TestClient]:
    """无认证 TestClient (用于公开端点)."""
    from app.core.database import get_db

    assessment_app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(assessment_app)
    finally:
        assessment_app.dependency_overrides.clear()


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID


@pytest.fixture
def fake_org_id() -> str:
    return _FAKE_ORG_ID


def _make_org_context(
    role: str = "org_admin",
    role_v2: str = "clinic_admin",
    org_type: str = "counseling",
) -> Any:
    from app.middleware.org_context import LicenseInfo, OrgContext

    return OrgContext(
        org_id=_FAKE_ORG_ID,
        org_type=org_type,
        role=role,
        role_v2=role_v2,
        member_id="member-x",
        full_practice_access=(role == "org_admin"),
        tier="starter",
        license=LicenseInfo(status="none"),
    )


def _make_data_scope_all() -> Any:
    from app.middleware.data_scope import DataScope

    return DataScope(type="all")


@pytest.fixture
def admin_client(client: TestClient, assessment_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext (org_admin) + DataScope=all."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import get_data_scope
    from app.middleware.org_context import get_org_context

    assessment_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="admin@example.com",
        is_system_admin=False,
    )
    assessment_app.dependency_overrides[get_org_context] = lambda: _make_org_context()
    assessment_app.dependency_overrides[get_data_scope] = lambda: _make_data_scope_all()
    try:
        yield client
    finally:
        for k in (get_current_user, get_org_context, get_data_scope):
            assessment_app.dependency_overrides.pop(k, None)


@pytest.fixture
def staff_client(client: TestClient, assessment_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext (counselor) + DataScope=all (full_practice 不开但够测 GET)."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import get_data_scope
    from app.middleware.org_context import get_org_context

    assessment_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="counselor@example.com",
        is_system_admin=False,
    )
    assessment_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="counselor", role_v2="counselor"
    )
    assessment_app.dependency_overrides[get_data_scope] = lambda: _make_data_scope_all()
    try:
        yield client
    finally:
        for k in (get_current_user, get_org_context, get_data_scope):
            assessment_app.dependency_overrides.pop(k, None)


@pytest.fixture
def client_role_client(client: TestClient, assessment_app: FastAPI) -> Iterator[TestClient]:
    """已认证 + OrgContext (legacy role='client') — 用于 rejectClient 测试."""
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.data_scope import get_data_scope
    from app.middleware.org_context import get_org_context

    assessment_app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=_FAKE_USER_ID,
        email="client@example.com",
        is_system_admin=False,
    )
    assessment_app.dependency_overrides[get_org_context] = lambda: _make_org_context(
        role="client", role_v2="client"
    )
    assessment_app.dependency_overrides[get_data_scope] = lambda: _make_data_scope_all()
    try:
        yield client
    finally:
        for k in (get_current_user, get_org_context, get_data_scope):
            assessment_app.dependency_overrides.pop(k, None)


@pytest.fixture
def unauthed_client(assessment_app: FastAPI, mock_db: AsyncMock) -> Iterator[TestClient]:
    """无认证 — 用于 401 路径."""
    from app.core.database import get_db

    assessment_app.dependency_overrides.clear()
    assessment_app.dependency_overrides[get_db] = lambda: mock_db
    try:
        yield TestClient(assessment_app)
    finally:
        assessment_app.dependency_overrides.clear()


# ─── PHI access capture ─────────────────────────────────────────


@pytest.fixture
def phi_access_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """
    捕获 ``record_phi_access`` 调用 (在 result_router 模块 namespace 上 patch).

    测试 (e.g. test_get_result_writes_phi_log) 用这个 fixture assert phi log
    在 PHI 路径上被写, 在自己看自己 / 匿名结果路径上没被写.
    """
    captured: list[dict[str, Any]] = []

    async def _capture(**kwargs: Any) -> None:
        captured.append(kwargs)

    import importlib

    result_router_mod = importlib.import_module("app.api.v1.assessment.result_router")
    monkeypatch.setattr(result_router_mod, "record_phi_access", _capture)
    return captured


# ─── triage automation no-op (避免测试中触 DB 二次提交) ────────


@pytest.fixture
def disable_triage(monkeypatch: pytest.MonkeyPatch) -> None:
    """禁用 auto_triage_and_notify (submit_result 触发的 fire-and-forget 任务).

    submit_result 测试只关心评分 / 风险派生本身; triage 副作用单独测.
    """
    import importlib

    rmod = importlib.import_module("app.api.v1.assessment.result_router")

    async def _noop(**kwargs: Any) -> None:
        return None

    monkeypatch.setattr(rmod, "auto_triage_and_notify", _noop)


# ─── 工厂 helpers ──────────────────────────────────────────────


def _make_assessment(
    *,
    aid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "Test Assessment",
    deleted: bool = False,
) -> Any:
    from app.db.models.assessments import Assessment

    a = Assessment()
    a.id = aid or uuid.UUID("00000000-0000-0000-0000-000000000111")
    a.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    a.title = title
    a.description = None
    a.assessment_type = "screening"
    a.demographics = []
    a.blocks = []
    a.screening_rules = {}
    a.collect_mode = "anonymous"
    a.result_display = {"mode": "custom", "show": []}
    a.share_token = "abcdef0123456789"
    a.allow_client_report = False
    a.status = "active"
    a.is_active = True
    a.created_by = uuid.UUID(_FAKE_USER_ID)
    # mypy: SQLAlchemy mapped columns have complex Union types in stub mode; here
    # we set them as plain attrs to mock ORM defaults. type: ignore 仅在 conftest.
    a.deleted_at = None if not deleted else uuid.uuid4()  # type: ignore[assignment]
    a.created_at = None  # type: ignore[assignment]
    a.updated_at = None  # type: ignore[assignment]
    return a


def _make_scale(
    *,
    sid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    title: str = "Test Scale",
    is_public: bool = False,
) -> Any:
    from app.db.models.scales import Scale

    s = Scale()
    s.id = sid or uuid.UUID("00000000-0000-0000-0000-000000000222")
    s.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    s.title = title
    s.description = None
    s.instructions = None
    s.scoring_mode = "sum"
    s.is_public = is_public
    s.allowed_org_ids = []
    s.created_by = uuid.UUID(_FAKE_USER_ID)
    s.created_at = None  # type: ignore[assignment]
    s.updated_at = None  # type: ignore[assignment]
    return s


def _make_batch(
    *,
    bid: uuid.UUID | None = None,
    aid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    status: str = "active",
) -> Any:
    from app.db.models.assessment_batches import AssessmentBatch

    b = AssessmentBatch()
    b.id = bid or uuid.UUID("00000000-0000-0000-0000-000000000333")
    b.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    b.assessment_id = aid or uuid.UUID("00000000-0000-0000-0000-000000000111")
    b.title = "Test Batch"
    b.target_type = "class"
    b.target_config = {"class_ids": []}
    b.deadline = None
    b.status = status
    b.stats = {"total": 10}
    b.created_by = uuid.UUID(_FAKE_USER_ID)
    b.created_at = None  # type: ignore[assignment]
    return b


def _make_distribution(
    *,
    did: uuid.UUID | None = None,
    aid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
) -> Any:
    from app.db.models.distributions import Distribution

    d = Distribution()
    d.id = did or uuid.UUID("00000000-0000-0000-0000-000000000444")
    d.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    d.assessment_id = aid or uuid.UUID("00000000-0000-0000-0000-000000000111")
    d.mode = "public"
    d.batch_label = None
    d.targets = []
    d.schedule = {}
    d.status = "active"
    d.completed_count = 0
    d.created_by = uuid.UUID(_FAKE_USER_ID)
    d.created_at = None  # type: ignore[assignment]
    return d


def _make_result(
    *,
    rid: uuid.UUID | None = None,
    aid: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    risk_level: str | None = None,
    deleted: bool = False,
) -> Any:
    from decimal import Decimal

    from app.db.models.assessment_results import AssessmentResult

    r = AssessmentResult()
    r.id = rid or uuid.UUID("00000000-0000-0000-0000-000000000555")
    r.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    r.assessment_id = aid or uuid.UUID("00000000-0000-0000-0000-000000000111")
    r.user_id = user_id
    r.care_episode_id = None
    r.demographic_data = {}
    r.answers = {"item-1": 1}
    r.custom_answers = {}
    r.dimension_scores = {}
    r.total_score = Decimal("0")
    r.risk_level = risk_level
    r.ai_interpretation = None
    r.client_visible = False
    r.recommendations = []
    r.ai_provenance = None
    r.batch_id = None
    r.created_by = uuid.UUID(_FAKE_USER_ID)
    r.deleted_at = None if not deleted else uuid.uuid4()  # type: ignore[assignment]
    r.created_at = None  # type: ignore[assignment]
    return r


def _make_report(
    *,
    rid: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    report_type: str = "individual_single",
) -> Any:
    from app.db.models.assessment_reports import AssessmentReport

    rep = AssessmentReport()
    rep.id = rid or uuid.UUID("00000000-0000-0000-0000-000000000666")
    rep.org_id = org_id or uuid.UUID(_FAKE_ORG_ID)
    rep.title = "Test Report"
    rep.report_type = report_type
    rep.result_ids = []
    rep.batch_id = None
    rep.assessment_id = None
    rep.scale_id = None
    rep.content = {"riskLevel": "level_1"}
    rep.ai_narrative = None
    rep.generated_by = uuid.UUID(_FAKE_USER_ID)
    rep.created_at = None  # type: ignore[assignment]
    return rep


@pytest.fixture
def make_assessment() -> Any:
    return _make_assessment


@pytest.fixture
def make_scale() -> Any:
    return _make_scale


@pytest.fixture
def make_batch() -> Any:
    return _make_batch


@pytest.fixture
def make_distribution() -> Any:
    return _make_distribution


@pytest.fixture
def make_result() -> Any:
    return _make_result


@pytest.fixture
def make_report() -> Any:
    return _make_report
