"""Tests for app/middleware/role_guards.py — 共享 role-guard helper。

镜像 Node rejectClient / requireRole 行为, 校验:
  - reject_client: org=None / role='client' → 403; sysadm 短路放行
  - require_role: 白名单外 role → 403
  - require_admin / require_admin_or_counselor 是 require_role wrapper
  - require_system_admin: 非 sysadm → 403
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import pytest

if TYPE_CHECKING:
    from app.middleware.org_context import OrgContext


# ---- helpers (lazy-imported to satisfy base_env Settings init) ----


def _make_org(role: str, *, org_id: str = "11111111-1111-1111-1111-111111111111") -> OrgContext:
    """构造一个最简 OrgContext, 测试只用 role 字段。"""
    from app.middleware.org_context import LicenseInfo, OrgContext

    role_v2 = {
        "org_admin": "clinic_admin",
        "counselor": "counselor",
        "client": "client",
    }.get(role, "client")
    return OrgContext(
        org_id=org_id,
        org_type="counseling",
        role=cast("Any", role),
        role_v2=cast("Any", role_v2),
        member_id=f"member-{role}",
        full_practice_access=role == "org_admin",
        tier=cast("Any", "starter"),
        license=LicenseInfo(status="none"),
    )


def _import_guards() -> tuple[Any, Any, Any, Any, Any]:
    """Lazy import 让 base_env env 已经设置后再 trigger Settings()。"""
    from app.middleware.role_guards import (
        reject_client,
        require_admin,
        require_admin_or_counselor,
        require_role,
        require_system_admin,
    )

    return (
        reject_client,
        require_admin,
        require_admin_or_counselor,
        require_role,
        require_system_admin,
    )


# ─── reject_client ─────────────────────────────────────────────────


def test_reject_client_passes_admin_role(base_env: pytest.MonkeyPatch) -> None:
    reject_client, *_ = _import_guards()
    org = _make_org("org_admin")
    assert reject_client(org) is org


def test_reject_client_passes_counselor_role(base_env: pytest.MonkeyPatch) -> None:
    reject_client, *_ = _import_guards()
    org = _make_org("counselor")
    assert reject_client(org) is org


def test_reject_client_rejects_client_role(base_env: pytest.MonkeyPatch) -> None:
    reject_client, *_ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("client")
    with pytest.raises(ForbiddenError):
        reject_client(org)


def test_reject_client_rejects_no_org(base_env: pytest.MonkeyPatch) -> None:
    reject_client, *_ = _import_guards()
    from app.lib.errors import ForbiddenError

    with pytest.raises(ForbiddenError) as ei:
        reject_client(None)
    assert ei.value.message == "org_context_required"


def test_reject_client_custom_messages(base_env: pytest.MonkeyPatch) -> None:
    reject_client, *_ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("client")
    with pytest.raises(ForbiddenError) as ei:
        reject_client(org, client_message="来访者请通过客户端门户访问")
    assert ei.value.message == "来访者请通过客户端门户访问"


def test_reject_client_sysadm_passes_with_org(base_env: pytest.MonkeyPatch) -> None:
    """sysadm + org 存在 → 放行 (notification 兼容)。"""
    reject_client, *_ = _import_guards()
    from app.middleware.auth import AuthUser

    user = AuthUser(id="sys", email="sys@x", is_system_admin=True)
    org = _make_org("client")  # 即使 role=client, sysadm 也应放行
    assert reject_client(org, user=user) is org


def test_reject_client_sysadm_no_org_still_rejects(base_env: pytest.MonkeyPatch) -> None:
    """sysadm 但 org 还是 None (路径解析失败) → 仍 403。"""
    reject_client, *_ = _import_guards()
    from app.lib.errors import ForbiddenError
    from app.middleware.auth import AuthUser

    user = AuthUser(id="sys", email="sys@x", is_system_admin=True)
    with pytest.raises(ForbiddenError):
        reject_client(None, user=user)


# ─── require_role ──────────────────────────────────────────────────


def test_require_role_admin_default(base_env: pytest.MonkeyPatch) -> None:
    _, _, _, require_role, _ = _import_guards()
    org = _make_org("org_admin")
    assert require_role(org) is org


def test_require_role_rejects_counselor_when_admin_only(base_env: pytest.MonkeyPatch) -> None:
    _, _, _, require_role, _ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("counselor")
    with pytest.raises(ForbiddenError):
        require_role(org)


def test_require_role_passes_counselor_with_explicit_roles(base_env: pytest.MonkeyPatch) -> None:
    _, _, _, require_role, _ = _import_guards()
    org = _make_org("counselor")
    assert require_role(org, roles=("org_admin", "counselor")) is org


def test_require_role_no_org(base_env: pytest.MonkeyPatch) -> None:
    _, _, _, require_role, _ = _import_guards()
    from app.lib.errors import ForbiddenError

    with pytest.raises(ForbiddenError) as ei:
        require_role(None)
    assert ei.value.message == "org_context_required"


def test_require_role_custom_message(base_env: pytest.MonkeyPatch) -> None:
    _, _, _, require_role, _ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("counselor")
    with pytest.raises(ForbiddenError) as ei:
        require_role(org, insufficient_message="This action requires the role: org_admin")
    assert ei.value.message == "This action requires the role: org_admin"


# ─── require_admin & require_admin_or_counselor ────────────────────


def test_require_admin_pass(base_env: pytest.MonkeyPatch) -> None:
    _, require_admin, *_ = _import_guards()
    org = _make_org("org_admin")
    assert require_admin(org) is org


def test_require_admin_reject_counselor(base_env: pytest.MonkeyPatch) -> None:
    _, require_admin, *_ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("counselor")
    with pytest.raises(ForbiddenError):
        require_admin(org)


def test_require_admin_or_counselor_admin(base_env: pytest.MonkeyPatch) -> None:
    _, _, require_admin_or_counselor, *_ = _import_guards()
    org = _make_org("org_admin")
    assert require_admin_or_counselor(org) is org


def test_require_admin_or_counselor_counselor(base_env: pytest.MonkeyPatch) -> None:
    _, _, require_admin_or_counselor, *_ = _import_guards()
    org = _make_org("counselor")
    assert require_admin_or_counselor(org) is org


def test_require_admin_or_counselor_reject_client(base_env: pytest.MonkeyPatch) -> None:
    _, _, require_admin_or_counselor, *_ = _import_guards()
    from app.lib.errors import ForbiddenError

    org = _make_org("client")
    with pytest.raises(ForbiddenError):
        require_admin_or_counselor(org)


# ─── require_system_admin ──────────────────────────────────────────


def test_require_system_admin_pass(base_env: pytest.MonkeyPatch) -> None:
    *_, require_system_admin = _import_guards()
    from app.middleware.auth import AuthUser

    user = AuthUser(id="sys", email="sys@x", is_system_admin=True)
    require_system_admin(user)  # no raise


def test_require_system_admin_reject(base_env: pytest.MonkeyPatch) -> None:
    *_, require_system_admin = _import_guards()
    from app.lib.errors import ForbiddenError
    from app.middleware.auth import AuthUser

    user = AuthUser(id="u", email="u@x", is_system_admin=False)
    with pytest.raises(ForbiddenError):
        require_system_admin(user)
