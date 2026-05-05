"""共享 v1 测试辅助 (Phase 5 simplify).

各模块 ``tests/api/v1/<module>/conftest.py`` 之前各自 inline 同款 fixture / helper:

  - ``mock_db()`` — AsyncMock + sync ``add`` (+ optional auto-UUID) + commit/flush
  - ``setup_db_results_factory()`` — 工厂式 ``setup_db_results`` 接 ``db.execute``
  - ``make_query_result()`` — 把任意 row 包成 mock SQLAlchemy Result
  - ``make_org_context()`` — 标准化 OrgContext 构造 (role / role_v2 / org_type 派生)

这里把它们提取出来共享, 各 conftest import 即可重用. 模块特有的 fixture
(local FastAPI app + dependency_overrides) 仍保留各自 conftest, 因为各模块
mount 的 router 不同.

模块名故意是 ``_conftest_helpers.py`` 而不是 ``conftest.py`` —— pytest
对 conftest.py 有自动发现规则, 这里只是 helper module, 不该被 pytest 当成
conftest 处理。各 conftest 显式 ``from tests.api.v1._conftest_helpers
import ...`` 重用。
"""

from __future__ import annotations

import contextlib
import uuid
from collections.abc import Callable
from typing import Any, Protocol
from unittest.mock import AsyncMock, MagicMock

# ─── Protocols ─────────────────────────────────────────────────────


class SetupDbResults(Protocol):
    """``setup_db_results`` fixture 的可调用签名 (FIFO)."""

    def __call__(self, rows: list[Any]) -> None: ...


# ─── make_query_result ────────────────────────────────────────────


def make_query_result(row: Any) -> MagicMock:
    """构造 mock SQLAlchemy Result, 兼容多种消费形式 (取所有 conftest 的并集)::

        result.scalar_one_or_none() -> row
        result.scalar() -> row
        result.scalar_one() -> row (count 等场景常用; row 不是 int 时 fallback 0)
        result.first() -> row (单行, list 时取第一个)
        result.all() -> [row, ...]
        result.scalars().all() -> [row, ...]
        result.mappings().all() -> [row, ...]
        result.mappings().first() -> row (list 时取第一个)

    若 ``row`` 自身是 list, 当作多行结果集; 否则当作单 row (None → 空列表).
    """
    result = MagicMock()
    if isinstance(row, list):
        rows_list: list[Any] = list(row)
        first_value: Any = rows_list[0] if rows_list else None
    elif row is None:
        rows_list = []
        first_value = None
    else:
        rows_list = [row]
        first_value = row

    result.scalar_one_or_none = MagicMock(return_value=row)
    result.scalar = MagicMock(return_value=row)
    # scalar_one 多用于 count(*); row 不是 int 时退回 0 (与 enrollment_response/notification 行为一致).
    result.scalar_one = MagicMock(return_value=row if isinstance(row, int) else 0)
    # first(): 当 row 是单值时返 row; 当是 list 时返第一项 — 兼容两种风格 (counseling 风格 vs collaboration 风格).
    # 大部分现有测试只关心 row 是 single 时的语义, 这种情况两风格等价 (单值就是第一项).
    # list 场景 (row=[a,b,c]) 不同 router 期望不同 — 我们选 list[0] (collaboration 风格), 因为 router
    # 写法多是 ``rows = result.scalars().all()`` 而不是 ``first()`` 拿 list 头.
    result.first = MagicMock(return_value=first_value)

    result.all = MagicMock(return_value=rows_list)
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=rows_list)
    scalars.first = MagicMock(return_value=first_value)
    result.scalars = MagicMock(return_value=scalars)

    mappings = MagicMock()
    mappings.all = MagicMock(return_value=rows_list)
    mappings.first = MagicMock(return_value=first_value)
    result.mappings = MagicMock(return_value=mappings)
    return result


# ─── make_mock_db ──────────────────────────────────────────────────


def make_mock_db(*, auto_uuid_on_add: bool = False) -> AsyncMock:
    """构造一个 mock AsyncSession, 默认配齐 add/commit/flush/rollback/execute/delete/refresh。

    Args:
        auto_uuid_on_add: 若 True, ``db.add(obj)`` 会自动给 ``obj.id`` 赋一个新 UUID
            (模拟 DB ``server_default=gen_random_uuid()`` 在 flush 时回填).
            assessment / counseling 等需要在测试里立刻 ``str(obj.id)`` 的模块用 True.
            其他模块 (e.g. compliance) 不需要这个行为, 用默认 False (普通 MagicMock).
    """
    db = AsyncMock()

    if auto_uuid_on_add:

        def _add_with_id(obj: Any) -> None:
            if hasattr(obj, "id") and (obj.id is None or not isinstance(obj.id, uuid.UUID)):
                # 一些 ORM 对象的 id 列不可写, 用 suppress 忽略 setter 异常
                with contextlib.suppress(Exception):
                    obj.id = uuid.uuid4()

        def _add_all_with_id(objs: Any) -> None:
            for o in objs:
                _add_with_id(o)

        db.add = MagicMock(side_effect=_add_with_id)
        db.add_all = MagicMock(side_effect=_add_all_with_id)
    else:
        db.add = MagicMock()
        db.add_all = MagicMock()

    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    db.delete = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ─── setup_db_results_factory ─────────────────────────────────────


def setup_db_results_factory(mock_db: AsyncMock) -> SetupDbResults:
    """返回一个 ``setup`` callable, FIFO 配 db.execute.side_effect。

    用法::

        # In conftest:
        @pytest.fixture
        def setup_db_results(mock_db):
            return setup_db_results_factory(mock_db)
    """

    def _setup(rows: list[Any]) -> None:
        results = [make_query_result(r) for r in rows]
        mock_db.execute = AsyncMock(side_effect=results)

    return _setup


# ─── make_org_context ──────────────────────────────────────────────


# org_type → 默认 role_v2 映射 (与 app/shared/roles.py:legacy_role_to_v2 一致).
# 测试不需要全完整, 列常用 org_type=counseling.
_DEFAULT_ROLE_V2: dict[tuple[str, str], str] = {
    ("counseling", "org_admin"): "clinic_admin",
    ("counseling", "counselor"): "counselor",
    ("counseling", "client"): "client",
    ("school", "org_admin"): "school_admin",
    ("school", "counselor"): "psychologist",
    ("school", "client"): "student",
    ("enterprise", "org_admin"): "hr_admin",
    ("enterprise", "counselor"): "eap_consultant",
    ("enterprise", "client"): "employee",
    ("solo", "org_admin"): "owner",
    ("solo", "counselor"): "owner",
    ("solo", "client"): "client",
    ("hospital", "org_admin"): "hospital_admin",
    ("hospital", "counselor"): "attending",
    ("hospital", "client"): "patient",
}


_DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000099"
_DEFAULT_MEMBER_ID = "member-x"


def make_org_context(
    role: str = "org_admin",
    *,
    org_id: str = _DEFAULT_ORG_ID,
    org_type: str = "counseling",
    role_v2: str | None = None,
    member_id: str = _DEFAULT_MEMBER_ID,
    tier: str = "starter",
    full_practice_access: bool | None = None,
    **kwargs: Any,
) -> Any:
    """构造一个标准 OrgContext, 测试默认 ``counseling / org_admin / starter``.

    ``role_v2`` 默认按 (org_type, role) 派生; 显式传入则覆盖.
    ``full_practice_access`` 默认: ``role == 'org_admin'``.
    其他 kwargs (e.g. ``allowed_data_classes``) 透传到 OrgContext。
    """
    # 局部 import 避开 Settings 校验; 调用方先在 fixture 里 base_env / autouse env 配好.
    from app.middleware.org_context import LicenseInfo, OrgContext

    resolved_role_v2 = role_v2 or _DEFAULT_ROLE_V2.get((org_type, role)) or "client"
    resolved_fpa = (role == "org_admin") if full_practice_access is None else full_practice_access

    return OrgContext(
        org_id=org_id,
        org_type=org_type,  # type: ignore[arg-type]
        role=role,  # type: ignore[arg-type]
        role_v2=resolved_role_v2,  # type: ignore[arg-type]
        member_id=member_id,
        full_practice_access=resolved_fpa,
        tier=tier,  # type: ignore[arg-type]
        license=LicenseInfo(status="none"),
        **kwargs,
    )


# ─── 通用 fixture 装配器 ───────────────────────────────────────────


def make_authed_client_factory(
    test_app_fixture_value: Any,
    *,
    user_id: str = "00000000-0000-0000-0000-000000000001",
    email: str = "user@example.com",
    is_system_admin: bool = False,
) -> Callable[[], Any]:
    """返回一个 yield TestClient 的生成器, 已 override get_current_user。

    各 conftest 用于把 ``test_app`` + 身份转换成可直接发请求的 TestClient.
    使用例::

        @pytest.fixture
        def authed_client(test_app):
            from tests.api.v1._conftest_helpers import make_authed_client_factory
            yield from make_authed_client_factory(test_app)()
    """
    from fastapi.testclient import TestClient

    from app.middleware.auth import AuthUser, get_current_user

    def _factory() -> Any:
        test_app_fixture_value.dependency_overrides[get_current_user] = lambda: AuthUser(
            id=user_id, email=email, is_system_admin=is_system_admin
        )
        try:
            yield TestClient(test_app_fixture_value)
        finally:
            test_app_fixture_value.dependency_overrides.pop(get_current_user, None)

    return _factory
