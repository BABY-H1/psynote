"""
Tests for app/middleware/data_scope.py — `resolve_data_scope` + `get_data_scope` Dependency。

镜像 server/src/middleware/data-scope.ts 的 6 个分支:

  1. sysadm                                       → None
  2. 没 OrgContext                                → DataScope(none)
  3. enterprise + org_admin                       → aggregate_only (HR PHI 隔离)
  4. 非-enterprise org_admin / counselor + fullPractice → all
  5. 普通 counselor                                → assigned + 3 表 union
  6. 其他 (client / 占位 hospital 角色等)          → none

Phase 1.5 Counselor 路径的 3-表 union 暂返回空 set (helper 函数占位),
Phase 2 ORM 模型完整后再填实。tests 用 monkeypatch.setattr 把 helper mock
成具体集合, 验证 union+sort+tuple 包装。
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

# ─── helpers ──────────────────────────────────────────────────────


def _user(is_sysadm: bool = False) -> Any:
    from app.middleware.auth import AuthUser

    return AuthUser(id="user-1", email="u@x.com", is_system_admin=is_sysadm)


def _org(
    *,
    role: str = "counselor",
    org_type: str = "counseling",
    full_practice_access: bool = False,
    supervisee_user_ids: tuple[str, ...] = (),
) -> Any:
    """构造 OrgContext (Phase 1.6 后字段扩展) — 自动派生 role_v2 / principal_class。"""
    from app.middleware.org_context import LicenseInfo, OrgContext
    from app.shared.roles import legacy_role_to_v2, principal_of

    role_v2 = legacy_role_to_v2(org_type, role)
    return OrgContext(
        org_id="org-1",
        org_type=org_type,
        role=role,
        role_v2=role_v2,
        member_id="member-test-1",
        full_practice_access=full_practice_access,
        supervisee_user_ids=supervisee_user_ids,
        tier="starter",
        license=LicenseInfo(status="none"),
        principal_class=principal_of(role_v2),
    )


# ─── 分支 1: sysadm → None ────────────────────────────────────


@pytest.mark.asyncio
async def test_sysadm_returns_none(base_env: pytest.MonkeyPatch) -> None:
    """sysadm 走全局视图, 不限定 scope (与 Node 对齐)"""
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(is_sysadm=True),
        org=_org(),  # 即便有 org, sysadm 也不查
        db=AsyncMock(),
    )
    assert result is None


# ─── 分支 2: 没 OrgContext → DataScope(none) ──────────────────


@pytest.mark.asyncio
async def test_no_org_context_returns_none_scope(base_env: pytest.MonkeyPatch) -> None:
    """非 sysadm 但缺 OrgContext (例如 user 没加入任何 org) → 看不到任何东西"""
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(user=_user(), org=None, db=AsyncMock())
    assert result is not None
    assert result.type == "none"


# ─── 分支 3: enterprise + org_admin → aggregate_only ──────────


@pytest.mark.asyncio
async def test_enterprise_org_admin_aggregate_only(
    base_env: pytest.MonkeyPatch,
) -> None:
    """
    HR PHI 隔离硬红线 (Node data-scope.ts:33-36): enterprise 的 org_admin 只能
    看 eap_usage_events 这类聚合, 永远不能看个体临床数据。
    """
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(),
        org=_org(role="org_admin", org_type="enterprise"),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "aggregate_only"


# ─── 分支 4: 非-enterprise org_admin / counselor+fullPractice → all ───


@pytest.mark.asyncio
async def test_counseling_org_admin_all(base_env: pytest.MonkeyPatch) -> None:
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(),
        org=_org(role="org_admin", org_type="counseling"),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "all"


@pytest.mark.asyncio
async def test_school_org_admin_all(base_env: pytest.MonkeyPatch) -> None:
    """school 同样不是 enterprise, org_admin 走 all"""
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(),
        org=_org(role="org_admin", org_type="school"),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "all"


@pytest.mark.asyncio
async def test_counselor_full_practice_access_all(
    base_env: pytest.MonkeyPatch,
) -> None:
    """counselor + fullPracticeAccess (单人小诊所老板) → 全机构可见"""
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(),
        org=_org(role="counselor", org_type="counseling", full_practice_access=True),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "all"


# ─── 分支 5: 普通 counselor → assigned + 3 表 union ───────────


@pytest.mark.asyncio
async def test_normal_counselor_assigned_empty(
    base_env: pytest.MonkeyPatch,
) -> None:
    """
    Phase 1.5 阶段: _resolve_counselor_assignments 返回空 set (Phase 2 ORM 后才
    真查 DB)。此测试验证 type='assigned' 路由正确, 且 allowed_client_ids 是空 tuple。
    """
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(
        user=_user(),
        org=_org(role="counselor", org_type="counseling"),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "assigned"
    assert result.allowed_client_ids == ()


@pytest.mark.asyncio
async def test_normal_counselor_assigned_with_mocked_clients(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    把 _resolve_counselor_assignments mock 成返回具体集合, 验证 resolve 把它
    包成 (排序后的 tuple) 塞进 DataScope.allowed_client_ids。
    """
    from app.middleware import data_scope as ds_module

    async def mock_resolve(
        db: Any, org_id: str, counselor_user_id: str, supervisee_user_ids: Any
    ) -> set[str]:
        # 假设 union 后是这 4 个 (顺序乱)
        return {"client-3", "client-1", "client-2", "client-4"}

    monkeypatch.setattr(ds_module, "_resolve_counselor_assignments", mock_resolve)

    result = await ds_module.resolve_data_scope(
        user=_user(),
        org=_org(role="counselor"),
        db=AsyncMock(),
    )
    assert result is not None
    assert result.type == "assigned"
    # 排序好让测试稳定
    assert result.allowed_client_ids == ("client-1", "client-2", "client-3", "client-4")


@pytest.mark.asyncio
async def test_counselor_helper_called_with_supervisee_chain(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    org.supervisee_user_ids 必须正确传给 _resolve_counselor_assignments —
    Phase 2 ORM 实装时这部分需要查 supervisees 的 client_assignments。
    """
    from app.middleware import data_scope as ds_module

    captured: dict[str, Any] = {}

    async def mock_resolve(
        db: Any, org_id: str, counselor_user_id: str, supervisee_user_ids: Any
    ) -> set[str]:
        captured["supervisee_user_ids"] = supervisee_user_ids
        captured["counselor_user_id"] = counselor_user_id
        captured["org_id"] = org_id
        return set()

    monkeypatch.setattr(ds_module, "_resolve_counselor_assignments", mock_resolve)

    await ds_module.resolve_data_scope(
        user=_user(),
        org=_org(
            role="counselor",
            supervisee_user_ids=("supervisee-1", "supervisee-2"),
        ),
        db=AsyncMock(),
    )

    assert captured["supervisee_user_ids"] == ("supervisee-1", "supervisee-2")
    assert captured["counselor_user_id"] == "user-1"
    assert captured["org_id"] == "org-1"


# ─── 分支 6: 其他 role → none ──────────────────────────────────


@pytest.mark.asyncio
async def test_client_role_returns_none_scope(base_env: pytest.MonkeyPatch) -> None:
    from app.middleware.data_scope import resolve_data_scope

    result = await resolve_data_scope(user=_user(), org=_org(role="client"), db=AsyncMock())
    assert result is not None
    assert result.type == "none"


# 注: test_unknown_role_falls_through_to_none 在 LegacyRole 改 Literal 后无法构造
# (Pydantic 拒绝非法 role 值, 这正是 strict typing 想要的)。fall-through 到 'none' 的
# 唯一合法 legacy_role 是 'client', 已被 test_client_role_returns_none_scope 覆盖。


# ─── _resolve_counselor_assignments helper 占位行为 ───────────


@pytest.mark.asyncio
async def test_counselor_helper_returns_empty_set_phase_1_5(
    base_env: pytest.MonkeyPatch,
) -> None:
    """
    Phase 1.5 阶段 helper 返回空 set (TODO Phase 2)。
    本测试是占位 - Phase 2 实装时改为验证真实 union 逻辑。
    """
    from app.middleware.data_scope import _resolve_counselor_assignments

    result = await _resolve_counselor_assignments(
        db=AsyncMock(),
        org_id="org-1",
        counselor_user_id="counselor-1",
        supervisee_user_ids=("supervisee-1",),
    )
    assert result == set()


# ─── get_data_scope FastAPI Dependency wrapper ───────────────


@pytest.mark.asyncio
async def test_get_data_scope_dispatches_to_resolve(
    base_env: pytest.MonkeyPatch, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    get_data_scope 是薄壳, 内部就是调 resolve_data_scope。验证它把 user/org/db
    透传过去, 返回值原封不动。
    """
    from app.middleware import data_scope as ds_module
    from app.middleware.data_scope import DataScope, get_data_scope

    captured: dict[str, Any] = {}
    sentinel_scope = DataScope(type="all")

    async def mock_resolve(user: Any, org: Any, db: Any) -> Any:
        captured["user"] = user
        captured["org"] = org
        captured["db"] = db
        return sentinel_scope

    monkeypatch.setattr(ds_module, "resolve_data_scope", mock_resolve)

    user = _user()
    org = _org(role="org_admin", org_type="counseling")
    db_obj = AsyncMock()

    result = await get_data_scope(user=user, org=org, db=db_obj)

    assert result is sentinel_scope
    assert captured["user"] is user
    assert captured["org"] is org
    assert captured["db"] is db_obj
