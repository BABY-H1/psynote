"""
Enrollment response API 测试共享 fixture (复用 content_block / notification 同
pattern: dependency override 注入 OrgContext + AuthUser + mock AsyncSession).

覆盖三种角色的 TestClient:
  - ``staff_client``       — org_admin (counselor 等价 — 在 _require_staff_role 通过)
  - ``client_role_client`` — role='client' (用于 ownership 校验测试)
  - ``counselor_client``   — counselor (与 staff_client 等价但 role 字段不同)

mock_db 与 setup_db_results 与其他模块一致 (FIFO ``side_effect``)。

注: 本模块的两个 router 在 Tier 2 完成前还**没**注册到 ``app.main:app`` (任务约定
``app/main.py`` 由协调者最后统一改). 因此 conftest 自建一个 minimal FastAPI 实例
按 Node ``app.ts:251-252`` 的 prefix 挂载 router + client_router, 挂上 error
handler, 让 TestClient 直接打路径走通. 这是临时 scaffolding, Tier 2 后所有
模块测试统一走 ``app.main:app`` 时本 fixture 可改回标准 pattern (一行代码)。
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


class SetupDbResults(Protocol):
    """``setup_db_results`` fixture 形状 — 配 ``mock_db.execute`` FIFO side_effect。"""

    def __call__(self, rows: list[Any]) -> None: ...


FAKE_ORG_ID = "00000000-0000-0000-0000-000000000099"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _enrollment_response_test_env(base_env: pytest.MonkeyPatch) -> None:
    """让 ``Settings()`` 可构造 + NODE_ENV='test' (与 auth conftest 同 pattern)。"""
    base_env.setenv("NODE_ENV", "test")


def _make_query_result(row: Any) -> MagicMock:
    """
    构造 mock SQLAlchemy ``Result`` —— 同时支持:
      ``.scalar_one_or_none()`` (单行)
      ``.scalars().all()``      (列表)
      ``.first()``              (join 查 tuple 返一行)
      ``.scalar_one()``         (count 等单标量)
      ``.all()``                (raw row tuples — pending-safety join 查用)
    """
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    rows: list[Any] = list(row) if isinstance(row, list) else [row] if row is not None else []
    scalars_obj = MagicMock()
    scalars_obj.all = MagicMock(return_value=rows)
    result.scalars = MagicMock(return_value=scalars_obj)
    result.first = MagicMock(return_value=row)
    result.scalar_one = MagicMock(return_value=row if isinstance(row, int) else 0)
    result.all = MagicMock(return_value=rows)
    return result


@pytest.fixture
def mock_db() -> AsyncMock:
    """模拟 AsyncSession (与 content_block conftest 同结构)。"""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.execute = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def setup_db_results(mock_db: AsyncMock) -> SetupDbResults:
    """``setup_db_results([row1, row2, None])`` → mock_db.execute FIFO side_effect。"""

    def _setup(rows: list[Any]) -> None:
        results = [_make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


def _build_test_app() -> Any:
    """
    构造一个 minimal FastAPI 实例, 挂上本模块的两个 router + 全局 error handler。

    与 ``app.main:create_app`` 同 prefix 结构 (Node ``app.ts:251-252``):
      - /api/orgs/{org_id}/enrollment-responses           → router
      - /api/orgs/{org_id}/client/enrollment-responses    → client_router

    Tier 2 完成 + ``app/main.py`` 注册后可直接 ``from app.main import app`` 替换。
    """
    from fastapi import FastAPI

    from app.api.v1.enrollment_response import client_router, router
    from app.middleware.error_handler import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        router,
        prefix="/api/orgs/{org_id}/enrollment-responses",
        tags=["enrollment-response"],
    )
    app.include_router(
        client_router,
        prefix="/api/orgs/{org_id}/client/enrollment-responses",
        tags=["enrollment-response-client"],
    )
    return app


def _override_db_dep(app: Any, mock_db: AsyncMock) -> None:
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: mock_db


def _make_org_ctx(role: str = "org_admin") -> Any:
    """构造测试用 OrgContext (counseling)。role 走 str 而非 Literal — Pydantic 在
    OrgContext 内部用 Literal 校验, 走 str 入参 + ``cast`` 让 mypy strict 不报。"""
    from typing import cast

    from app.middleware.org_context import LicenseInfo, OrgContext
    from app.shared.roles import LegacyRole, RoleV2

    role_v2_map: dict[str, str] = {
        "org_admin": "clinic_admin",
        "counselor": "counselor",
        "client": "client",
    }
    return OrgContext(
        org_id=FAKE_ORG_ID,
        org_type="counseling",
        role=cast(LegacyRole, role),
        role_v2=cast(RoleV2, role_v2_map.get(role, "client")),
        member_id=f"member-{role}",
        full_practice_access=(role == "org_admin"),
        tier="starter",
        license=LicenseInfo(status="none"),
    )


def _make_auth_user(*, is_sysadm: bool = False) -> Any:
    from app.middleware.auth import AuthUser

    return AuthUser(
        id=FAKE_USER_ID,
        email="staff@example.com",
        is_system_admin=is_sysadm,
    )


def _client_for_role(mock_db: AsyncMock, role: str) -> TestClient:
    """共享: 构 minimal app + 注 db / user / org override → TestClient (调用方 yield + cleanup)。"""
    from app.middleware.auth import get_current_user
    from app.middleware.org_context import get_org_context

    app = _build_test_app()
    _override_db_dep(app, mock_db)
    app.dependency_overrides[get_current_user] = lambda: _make_auth_user()
    app.dependency_overrides[get_org_context] = lambda: _make_org_ctx(role)
    return TestClient(app)


@pytest.fixture
def staff_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """org_admin TestClient — pending-safety + review 端点都允许。"""
    test_client = _client_for_role(mock_db, "org_admin")
    try:
        yield test_client
    finally:
        test_client.app.dependency_overrides.clear()  # type: ignore[attr-defined]


@pytest.fixture
def counselor_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """counselor TestClient — 也通过 _require_staff_role。"""
    test_client = _client_for_role(mock_db, "counselor")
    try:
        yield test_client
    finally:
        test_client.app.dependency_overrides.clear()  # type: ignore[attr-defined]


@pytest.fixture
def client_role_client(mock_db: AsyncMock) -> Iterator[TestClient]:
    """role='client' TestClient — pending-safety / review 端点应 403, 列出仅看自己。"""
    test_client = _client_for_role(mock_db, "client")
    try:
        yield test_client
    finally:
        test_client.app.dependency_overrides.clear()  # type: ignore[attr-defined]


@pytest.fixture
def fake_org_id() -> str:
    return FAKE_ORG_ID


@pytest.fixture
def fake_user_id() -> str:
    return FAKE_USER_ID
