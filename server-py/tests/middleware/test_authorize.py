"""
Tests for app/middleware/authorize.py — `require_action` Dependency factory + assert_authorized。

镜像 server/src/middleware/authorize.ts 行为:
  1. system_admin bypass
  2. resolve Actor (优先 role_v2, 空则 legacy_role_to_v2)
  3. resolve Scope (data_scope.type='all' 直通, 'assigned' 取 allowed_client_ids)
  4. 调 policy.authorize, denied → 403 ForbiddenError 带 reason

Phase 1.4 设计折中:
  get_org_context 和 get_data_scope 在 1.5/1.6 才有真实实现, 这里只声明 stub
  接口 (raise NotImplementedError)。tests 用 FastAPI dependency_overrides 注入
  测试数据。Phase 1.5/1.6 完成后, 现有 1.4 测试无需改动。
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

# ─── 工具函数 (减少 boilerplate) ──────────────────────────────────


def _build_protected_app(
    action: str,
    data_class: str,
    *,
    extract_owner: Any = None,
    auth_user: Any = None,
    org_context: Any = None,
    data_scope: Any = None,
) -> tuple[FastAPI, TestClient]:
    """
    构造一个挂着 require_action 守门的 mini app + override 三个 dep
    (current_user / org_context / data_scope)。
    """
    from app.middleware.auth import AuthUser, get_current_user
    from app.middleware.authorize import (
        ResourceSelector,
        get_data_scope,
        get_org_context,
        require_action,
    )

    selector = ResourceSelector(
        type="test_resource",
        data_class=data_class,
        extract_owner_user_id=extract_owner,
    )

    app = FastAPI()

    @app.get("/protected/{owner_id}", dependencies=[Depends(require_action(action, selector))])
    async def handler(owner_id: str) -> dict[str, str]:
        return {"ok": "true", "owner_id": owner_id}

    if auth_user is not None:
        app.dependency_overrides[get_current_user] = lambda: auth_user
    else:
        app.dependency_overrides[get_current_user] = lambda: AuthUser(
            id="user-default", email="d@x.com", is_system_admin=False
        )
    if org_context is not None:
        app.dependency_overrides[get_org_context] = lambda: org_context
    if data_scope is not None:
        app.dependency_overrides[get_data_scope] = lambda: data_scope

    return app, TestClient(app)


def _org(
    *,
    role: str = "counselor",
    org_type: str = "counseling",
    role_v2: str | None = None,
    is_supervisor: bool = False,
    full_practice_access: bool = False,
    allowed_data_classes: tuple[str, ...] | None = None,
    guardian_of_user_ids: tuple[str, ...] = (),
    supervisee_user_ids: tuple[str, ...] = (),
) -> Any:
    """构造 OrgContext (Phase 1.6 后扩展) — 缺省 role_v2 时按 legacy_role_to_v2 派生。"""
    from app.middleware.authorize import OrgContext
    from app.middleware.org_context import LicenseInfo
    from app.shared.roles import legacy_role_to_v2, principal_of

    resolved_role_v2 = role_v2 or legacy_role_to_v2(org_type, role)
    return OrgContext(
        org_id="org-1",
        org_type=org_type,
        role=role,
        role_v2=resolved_role_v2,
        member_id="member-test-1",
        is_supervisor=is_supervisor,
        full_practice_access=full_practice_access,
        allowed_data_classes=allowed_data_classes,
        guardian_of_user_ids=guardian_of_user_ids,
        supervisee_user_ids=supervisee_user_ids,
        tier="starter",
        license=LicenseInfo(status="none"),
        principal_class=principal_of(resolved_role_v2),
    )


def _scope(scope_type: str = "assigned", allowed_client_ids: tuple[str, ...] = ()) -> Any:
    from app.middleware.authorize import DataScope

    return DataScope(type=scope_type, allowed_client_ids=allowed_client_ids)


# ─── system_admin bypass ──────────────────────────────────────


def test_system_admin_bypasses_all_checks(base_env: pytest.MonkeyPatch) -> None:
    """is_system_admin=True 直接放行, 不查 actor / data class / scope"""
    from app.middleware.auth import AuthUser

    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        auth_user=AuthUser(id="sysadm", email="x@y", is_system_admin=True),
        # 故意不 override org/scope, system_admin 应在调到它们之前就 return
    )
    response = client.get("/protected/some-client")
    assert response.status_code == 200


# ─── 拒绝路径 ────────────────────────────────────────────────


def test_counselor_blocked_from_unassigned_client(base_env: pytest.MonkeyPatch) -> None:
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("assigned", allowed_client_ids=("client-allowed",)),
    )
    response = client.get("/protected/client-not-allowed")
    assert response.status_code == 403
    body = response.json()
    assert "action_denied" in body["detail"]
    assert "scope_not_assigned" in body["detail"]


def test_hr_admin_blocked_from_phi_full(base_env: pytest.MonkeyPatch) -> None:
    """HR 硬红线: 仅 aggregate, 任何 PHI 拒绝。

    legacy ``role='org_admin'`` + ``org_type='enterprise'`` → role_v2='hr_admin'
    (合规硬隔离, 见 legacy_role_to_v2)。helper 自动派生 role_v2。
    """
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="org_admin", org_type="enterprise"),
        data_scope=_scope("all"),
    )
    response = client.get("/protected/anything")
    assert response.status_code == 403
    assert "role_data_class_not_allowed" in response.json()["detail"]


def test_counselor_cannot_manage_license(base_env: pytest.MonkeyPatch) -> None:
    """admin-only action"""
    _, client = _build_protected_app(
        "manage_license",
        "aggregate",
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("all"),
    )
    response = client.get("/protected/x")
    assert response.status_code == 403
    assert "role_cannot_perform_action" in response.json()["detail"]


# ─── 通过路径 ────────────────────────────────────────────────


def test_counselor_can_view_assigned_client(base_env: pytest.MonkeyPatch) -> None:
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("assigned", allowed_client_ids=("c1",)),
    )
    response = client.get("/protected/c1")
    assert response.status_code == 200


def test_clinic_admin_with_access_profile_phi_full(
    base_env: pytest.MonkeyPatch,
) -> None:
    """
    clinic_admin 默认无 phi_full, 但 allowed_data_classes (access_profile 单点
    放开后 effective 集合) 包含 phi_full → 通过。

    legacy ``role='org_admin'`` + ``org_type='counseling'`` → role_v2='clinic_admin'.
    """
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(
            role="org_admin",
            org_type="counseling",
            allowed_data_classes=("phi_full", "phi_summary", "de_identified", "aggregate"),
        ),
        data_scope=_scope("assigned", allowed_client_ids=("c1",)),
    )
    response = client.get("/protected/c1")
    assert response.status_code == 200


def test_clinic_admin_default_no_phi_full(base_env: pytest.MonkeyPatch) -> None:
    """allowed_data_classes=None → fallback ROLE_DATA_CLASS_POLICY → clinic_admin 无 phi_full"""
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="org_admin", org_type="counseling"),
        data_scope=_scope("all"),
    )
    response = client.get("/protected/c1")
    assert response.status_code == 403


# ─── data_scope='all' 直通语义 ────────────────────────────────


def test_scope_all_passes_owner_check(base_env: pytest.MonkeyPatch) -> None:
    """
    data_scope.type='all' (例如 supervisor 全局可见) 时, 不论 owner 是谁都通过 —
    Node 端是把 owner 自身注入 allowedClientIds 实现的。
    """
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("all"),  # 不需要列具体 allowed
    )
    response = client.get("/protected/any-client-id")
    assert response.status_code == 200


def test_scope_none_blocks_phi_full(base_env: pytest.MonkeyPatch) -> None:
    """data_scope.type='none' → allowed_client_ids 空, phi_full 必拒"""
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("none"),
    )
    response = client.get("/protected/c1")
    assert response.status_code == 403


# ─── legacy role 推 V2 ────────────────────────────────────────


def test_legacy_org_role_promoted_to_v2(base_env: pytest.MonkeyPatch) -> None:
    """
    org_members 没 role_v2 时, 用 legacy_role_to_v2 推。
    enterprise + 'org_admin' 必须推成 hr_admin (合规硬隔离), HR 不能 view phi_full。
    """
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        org_context=_org(role="org_admin", org_type="enterprise"),  # 无 role_v2
        data_scope=_scope("all"),
    )
    response = client.get("/protected/emp-1")
    assert response.status_code == 403
    assert "role_data_class_not_allowed" in response.json()["detail"]


def test_role_v2_overrides_legacy(base_env: pytest.MonkeyPatch) -> None:
    """role_v2 非空时优先, 不再走 legacy 映射"""
    _, client = _build_protected_app(
        "view",
        "phi_full",
        extract_owner=lambda r: r.path_params["owner_id"],
        # legacy role 是 'client' (subject), 但 role_v2 是 counselor → 应走 counselor
        org_context=_org(role="client", role_v2="counselor", org_type="counseling"),
        data_scope=_scope("assigned", allowed_client_ids=("c1",)),
    )
    response = client.get("/protected/c1")
    assert response.status_code == 200


# ─── extractor 缺失 → owner=None → "create new" 语义 ──────────


def test_no_owner_extractor_treated_as_create_new(base_env: pytest.MonkeyPatch) -> None:
    """
    selector 不带 extract_owner_user_id → owner=None。policy.py 在 phi_full +
    None owner 时返回 allowed=True (创建新资源场景, 业务层复查)。
    """
    _, client = _build_protected_app(
        "create",
        "phi_full",
        extract_owner=None,
        org_context=_org(role="counselor", org_type="counseling"),
        data_scope=_scope("none"),  # scope 都 none, 仍应允许 (create 语义)
    )
    response = client.get("/protected/whatever")
    assert response.status_code == 200


# ─── assert_authorized (inline 版) ───────────────────────────


def test_assert_authorized_passes(base_env: pytest.MonkeyPatch) -> None:
    """
    inline 版用法: 路由 handler 内查到资源拥有者后再调用。
    """
    from app.middleware.auth import AuthUser
    from app.middleware.authorize import ResourceSelector, assert_authorized

    user = AuthUser(id="u1", email="u@x", is_system_admin=False)
    org = _org(role="counselor", org_type="counseling")
    scope = _scope("assigned", allowed_client_ids=("c1",))
    selector = ResourceSelector(type="note", data_class="phi_full")

    # 不抛 = 通过
    assert_authorized(
        user=user,
        org=org,
        data_scope=scope,
        action="view",
        selector=selector,
        owner_user_id="c1",
    )


def test_assert_authorized_raises_403(base_env: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    from app.middleware.auth import AuthUser
    from app.middleware.authorize import ResourceSelector, assert_authorized

    user = AuthUser(id="u1", email="u@x", is_system_admin=False)
    org = _org(role="counselor", org_type="counseling")
    scope = _scope("assigned", allowed_client_ids=("c1",))
    selector = ResourceSelector(type="note", data_class="phi_full")

    with pytest.raises(HTTPException) as exc:
        assert_authorized(
            user=user,
            org=org,
            data_scope=scope,
            action="view",
            selector=selector,
            owner_user_id="c-NOT-allowed",
        )
    assert exc.value.status_code == 403
    assert "scope_not_assigned" in str(exc.value.detail)


def test_assert_authorized_system_admin_bypasses(
    base_env: pytest.MonkeyPatch,
) -> None:
    from app.middleware.auth import AuthUser
    from app.middleware.authorize import ResourceSelector, assert_authorized

    sysadm = AuthUser(id="sa", email="sa@x", is_system_admin=True)
    selector = ResourceSelector(type="anything", data_class="phi_full")

    # sysadm 通常没 org context, 传 None 应通过
    assert_authorized(
        user=sysadm,
        org=None,
        data_scope=None,
        action="delete",  # 也是高危动作
        selector=selector,
        owner_user_id="anyone",
    )


def test_assert_authorized_non_admin_without_org_returns_403(
    base_env: pytest.MonkeyPatch,
) -> None:
    """非 sysadm 调用时缺 org context → 403 (路由配置错)"""
    from fastapi import HTTPException

    from app.middleware.auth import AuthUser
    from app.middleware.authorize import ResourceSelector, assert_authorized

    user = AuthUser(id="u", email="u@x", is_system_admin=False)
    selector = ResourceSelector(type="x", data_class="phi_full")

    with pytest.raises(HTTPException) as exc:
        assert_authorized(
            user=user,
            org=None,
            data_scope=None,
            action="view",
            selector=selector,
            owner_user_id="c1",
        )
    assert exc.value.status_code == 403
    assert "org_context_required" in str(exc.value.detail)


# ─── stub deps raise NotImplementedError 直到 1.5/1.6 实现 ────


# 注: get_org_context 的 stub 测试在 Phase 1.6 后转移到 tests/middleware/test_org_context.py
# (1.6 里 get_org_context 已替换为真实实现, 不再 raise NotImplementedError)。


# 注: get_data_scope 的 stub 测试在 Phase 1.5 后转移到 tests/middleware/test_data_scope.py
# (因为 1.5 里 get_data_scope 已替换为真实实现, 不再 raise NotImplementedError)。
