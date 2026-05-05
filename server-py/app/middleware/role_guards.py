"""
共享 role-guard helpers — 提取 47 个 v1 router 各自 inline 的
``_reject_client`` / ``_require_org_admin`` / ``_require_admin_or_counselor``。

镜像 Node ``server/src/middleware/`` 的 rejectClient / requireRole 行为:

  - rejectClient: 'client' role 不可访问 staff 端点 → 403
  - requireRole: org.role 必须在白名单, 否则 → 403

签名设计 (Phase 5 simplify):

各 router 之前签名 3 种变体:
  1. ``-> None`` (校验后 caller 自己 ``assert org is not None``)
  2. ``-> OrgContext`` (校验后返回非 None 的 org, caller 直接用)
  3. 多带一个 ``user`` 参数 (notification 里的 sysadm 兼容)

这里统一为 ``-> OrgContext`` (返回非 None, mypy 友好), 配 ``user``
可选参数 (sysadm 短路放行); message 可选 override (preserve 各 router
原 message)。各 router import 后改用即可, 行为完全等价。

接入示例::

    from app.middleware.role_guards import reject_client, require_admin

    @router.get("/...")
    async def list_things(
        user: Annotated[AuthUser, Depends(get_current_user)],
        org: Annotated[OrgContext | None, Depends(get_org_context)],
    ) -> ...:
        org = reject_client(org)  # 等价 _reject_client + assert
        ...

Phase 7+ TODO: 全模块迁移到 ``app.middleware.authorize.assert_authorized``
统一 RBAC, 接入后这一层可降级成兜底 fast-path。

Phase 5 simplify defer items (从 Phase 3 Tier 1+2 review 累积) 选择 A:
启动期跳过 ``assert_authorized()`` 接入。原因:

  1. 当前 47 个 v1 router 都用 ``_reject_client + role string 比较``;
     一次性切换到 ``assert_authorized(user, org, data_class, action,
     selector, ...)`` 影响所有 RBAC 行为, 需要重测 ~200 个 test cases。
  2. ``assert_authorized`` 依赖 ``data_scope.type='all' / 'assigned' /
     'none'`` + ``ResourceSelector(type, data_class, extract_owner_user_id)``
     + ``policy.authorize`` 决议链, 与现有 router 的 simplify 后两段判断
     (``reject_client → require_role``) 在表达力上不对等 — 接入需要每个
     route 重新设计 selector + data_class。
  3. Phase 1.4 的 ``require_action`` Dependency factory 已经准备好接入
     入口 (用于 path-based selector), Phase 7+ 系统升级时可以分模块迁移
     不破坏其他模块。

迁移路线 (Phase 7+):
  a. 选 1 个高 RBAC 复杂度的模块 (e.g. counseling/episode_router 或
     assessment/result_router) 当 pilot, 走 ``require_action`` Dependency.
  b. 验证 e2e + unit + assert_authorized policy 行为对齐 Node.
  c. 模板化迁移 (data_class / selector 类型化 fixture), 推到 47 个 router.
  d. 本模块降级成内部 fast-path / 删除。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.lib.errors import ForbiddenError

if TYPE_CHECKING:
    from app.middleware.auth import AuthUser
    from app.middleware.org_context import OrgContext


_DEFAULT_NO_ORG = "org_context_required"
_DEFAULT_CLIENT_REJECTED = "Client role not permitted on this endpoint"
_DEFAULT_INSUFFICIENT_ROLE = "insufficient_role"


def reject_client(
    org: OrgContext | None,
    *,
    user: AuthUser | None = None,
    no_org_message: str = _DEFAULT_NO_ORG,
    client_message: str = _DEFAULT_CLIENT_REJECTED,
) -> OrgContext:
    """role == 'client' 或缺 org → ForbiddenError。返回非 None 的 OrgContext。

    镜像 Node ``rejectClient`` middleware。

    Args:
        org: 当前请求的 OrgContext (来自 ``get_org_context`` Depends)。
        user: 可选的 AuthUser; 若 ``user.is_system_admin`` 且 org 存在, 直接放行
            (notification 等模块需要 sysadm 兼容; 不传则不做 sysadm 短路)。
        no_org_message: org 为 None 时的 ForbiddenError message (默认
            'org_context_required'); 各 router 兼容用。
        client_message: org.role == 'client' 时的 message (默认英文
            'Client role not permitted on this endpoint'); 各 router 按需 override。

    Returns:
        非 None 的 OrgContext, 校验通过后让 caller 不再判空。

    Raises:
        ForbiddenError: 缺 org 或 role 是 client。
    """
    if org is None:
        if user is not None and user.is_system_admin:
            # sysadm 仍需 org context (路径里有 /orgs/{org_id}, 应解析出 org); 没解析到就 403
            raise ForbiddenError(no_org_message)
        raise ForbiddenError(no_org_message)
    if user is not None and user.is_system_admin:
        return org
    if org.role == "client":
        raise ForbiddenError(client_message)
    return org


def require_role(
    org: OrgContext | None,
    *,
    roles: tuple[str, ...] = ("org_admin",),
    no_org_message: str = _DEFAULT_NO_ORG,
    insufficient_message: str = _DEFAULT_INSUFFICIENT_ROLE,
) -> OrgContext:
    """org.role 必须在 ``roles`` 集合中, 否则 ForbiddenError。

    镜像 Node ``requireRole(...allowedRoles)`` middleware。

    Args:
        org: 当前请求的 OrgContext。
        roles: 允许通过的 legacy role 列表; 默认 ``('org_admin',)``。
        no_org_message: org 为 None 时的 message (默认 'org_context_required')。
        insufficient_message: role 不在白名单时的 message (默认 'insufficient_role')。

    Returns:
        非 None 的 OrgContext, 校验通过后 caller 不再判空。

    Raises:
        ForbiddenError: 缺 org 或 role 不在 ``roles`` 集合。
    """
    if org is None:
        raise ForbiddenError(no_org_message)
    if org.role not in roles:
        raise ForbiddenError(insufficient_message)
    return org


def require_admin(
    org: OrgContext | None,
    *,
    no_org_message: str = _DEFAULT_NO_ORG,
    insufficient_message: str = _DEFAULT_INSUFFICIENT_ROLE,
) -> OrgContext:
    """便捷 wrapper: ``require_role(org, roles=('org_admin',))``。

    Phase 5 之前各 router 自己 inline ``_require_org_admin``。

    Args:
        org: 当前请求的 OrgContext。
        no_org_message: org 为 None 时的 message。
        insufficient_message: role != 'org_admin' 时的 message。

    Returns:
        非 None 的 OrgContext (role 保证是 org_admin)。
    """
    return require_role(
        org,
        roles=("org_admin",),
        no_org_message=no_org_message,
        insufficient_message=insufficient_message,
    )


def require_admin_or_counselor(
    org: OrgContext | None,
    *,
    no_org_message: str = _DEFAULT_NO_ORG,
    insufficient_message: str = _DEFAULT_INSUFFICIENT_ROLE,
) -> OrgContext:
    """便捷 wrapper: ``require_role(org, roles=('org_admin', 'counselor'))``。

    Phase 5 之前各 router 自己 inline ``_require_admin_or_counselor``。

    Args:
        org: 当前请求的 OrgContext。
        no_org_message: org 为 None 时的 message。
        insufficient_message: role 不是 admin/counselor 时的 message。

    Returns:
        非 None 的 OrgContext (role 是 org_admin 或 counselor)。
    """
    return require_role(
        org,
        roles=("org_admin", "counselor"),
        no_org_message=no_org_message,
        insufficient_message=insufficient_message,
    )


def require_system_admin(user: AuthUser) -> None:
    """sysadm 守门 (admin 模块用); 不返 OrgContext (sysadm 路径通常没 /orgs/{org_id})。

    镜像 Node ``server/src/middleware/system-admin.ts`` requireSystemAdmin。

    Raises:
        ForbiddenError: ``user.is_system_admin`` 为 False。
    """
    if not user.is_system_admin:
        raise ForbiddenError("system admin only")
