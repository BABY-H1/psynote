"""
Authorize middleware (Phase 1.4) — `require_action` Dependency factory + `assert_authorized`。

镜像 server/src/middleware/authorize.ts (Node) 的 requireAction / assertAuthorized,
建立 RBAC 入口。decision 决策器走 app.shared.policy.authorize (Phase 1.3 已实现)。

设计折中:
  Phase 1.4 时 1.5 (data_scope) 和 1.6 (org_context) 还没真实现, 所以这里只
  声明 OrgContext / DataScope 数据形状 + stub Dependencies (raise
  NotImplementedError)。tests 用 FastAPI dependency_overrides 注入测试数据。

  Phase 1.5/1.6 完成后会在本模块替换 get_data_scope / get_org_context 的实现,
  require_action / assert_authorized 的 API 表面不变, 测试无需改。

用法 (Phase 3+ 路由层)::

    from app.middleware.authorize import require_action, ResourceSelector

    selector = ResourceSelector(
        type="case_note",
        data_class="phi_full",
        extract_owner_user_id=lambda req: req.path_params["client_id"],
    )

    @router.get(
        "/notes/{client_id}",
        dependencies=[Depends(require_action("view", selector))],
    )
    async def get_notes(client_id: str): ...

或路由 handler 内联 (owner 须先查 DB)::

    @router.patch("/notes/{note_id}")
    async def update_note(
        note_id: str,
        user: AuthUser = Depends(get_current_user),
        org: OrgContext = Depends(get_org_context),
        data_scope: DataScope = Depends(get_data_scope),
        db: AsyncSession = Depends(get_db),
    ):
        note = await db.get(Note, note_id)
        assert_authorized(
            user=user, org=org, data_scope=data_scope,
            action="edit",
            selector=ResourceSelector(type="case_note", data_class="phi_full"),
            owner_user_id=note.client_id,
        )
        # ... mutate
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.middleware.auth import AuthUser, get_current_user
from app.shared.policy import Actor, Resource, Scope, authorize
from app.shared.roles import legacy_role_to_v2

# ─── 数据形状 (Phase 1.5/1.6 填实现时复用) ─────────────────────────


class OrgContext(BaseModel):
    """
    当前请求的 org 成员上下文。Phase 1.6 (get_org_context) 从 org_members +
    access_profile 读出来填充。

    role 用 legacy 枚举 (org_admin/counselor/client) 与 Node 端 request.org.role
    保持兼容; role_v2 是新枚举 (RoleV2), 优先生效。
    """

    model_config = ConfigDict(frozen=True)

    org_id: str
    org_type: str
    role: str  # legacy: 'org_admin' | 'counselor' | 'client'
    role_v2: str | None = None
    is_supervisor: bool = False
    full_practice_access: bool = False
    # ROLE_DATA_CLASS_POLICY[role] ∪ access_profile.dataClasses (org_context 已合并)。
    # None → fallback role 默认策略; 显式 () → 比 role 默认更紧。
    allowed_data_classes: tuple[str, ...] | None = None
    guardian_of_user_ids: tuple[str, ...] = Field(default_factory=tuple)
    supervisee_user_ids: tuple[str, ...] = Field(default_factory=tuple)


class DataScope(BaseModel):
    """
    当前请求的可见数据范围。Phase 1.5 (get_data_scope) 按 role + 分派关系
    resolve 出来。

    type 含义:
      'all'             — 全机构可见 (system_admin / clinic_admin 等)
      'assigned'        — 仅被分派的 client (counselor / supervisee)
      'aggregate_only'  — 仅看聚合统计 (HR / school_leader)
      'none'            — 无可见 (新成员 / 未配置)
    """

    model_config = ConfigDict(frozen=True)

    type: str  # 'all' | 'assigned' | 'aggregate_only' | 'none'
    allowed_client_ids: tuple[str, ...] = Field(default_factory=tuple)


# ─── Stub Dependencies (Phase 1.5/1.6 fill in real impl) ─────────


async def get_org_context(
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> OrgContext | None:
    """
    Phase 1.6 实现: 读 org_members 行 + access_profile, 解析 effective_data_classes,
    构造 OrgContext。

    返回 ``None`` 的合法情形:
      - user.is_system_admin = True (平台管理员不绑定具体 org, 走全局视图)

    其他情形 Phase 1.4 暂 raise NotImplementedError —— 真实环境会立刻 500 提醒
    尚未接入 1.6。tests 用 dependency_overrides 绕过。
    """
    if user.is_system_admin:
        return None
    raise NotImplementedError(
        "Phase 1.6: get_org_context 尚未实现 — 真实环境需先 wire org_members 查询"
    )


async def get_data_scope(
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> DataScope | None:
    """
    Phase 1.5 实现: 按 actor.role + assignments 推 dataScope。

    返回 ``None`` 同 get_org_context: system_admin 无 scope 概念, 走全局。
    """
    if user.is_system_admin:
        return None
    raise NotImplementedError(
        "Phase 1.5: get_data_scope 尚未实现 — 真实环境需先 wire assignments 查询"
    )


# ─── ResourceSelector + helpers ──────────────────────────────────


@dataclass(frozen=True)
class ResourceSelector:
    """
    描述被守门资源的元数据。

    type:                       仅日志/审计用
    data_class:                 PHI 密级 (决策核心)
    extract_owner_user_id:      从 Request 抽 owner userId; None → owner=None
                                (policy 会按 "create new resource" 放行)
    extract_org_id:             从 Request 抽 org_id; None → 取 org_context.org_id
    """

    type: str
    data_class: str
    extract_owner_user_id: Callable[[Request], str | None] | None = None
    extract_org_id: Callable[[Request], str | None] | None = None


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _resolve_actor(user: AuthUser, org: OrgContext) -> Actor:
    """
    User + OrgContext → Actor. role_v2 优先, 空则 legacy_role_to_v2 推。

    isSupervisor: org_context 显式标 || (legacy counselor + fullPracticeAccess) —
    与 Node 端 authorize.ts:137-139 完全一致。
    """
    role = org.role_v2 or legacy_role_to_v2(org.org_type, org.role)
    is_supervisor = org.is_supervisor or (org.role == "counselor" and org.full_practice_access)
    return Actor(
        org_type=org.org_type,
        role=role,
        user_id=user.id,
        is_supervisor=is_supervisor,
        effective_data_classes=org.allowed_data_classes,
    )


def _resolve_scope(org: OrgContext, data_scope: DataScope, owner_user_id: str | None) -> Scope:
    """
    data_scope 类型语义 → Scope. 'all' 直通 (把 owner 自身注入 allowed), 'assigned'
    取 allowed_client_ids, 其他 (none / aggregate_only / 未知) 留空让 phi 资源被拒。
    """
    allowed_client_ids: tuple[str, ...] = ()
    if data_scope.type == "all":
        # 'all' 直通: 把 owner 自身注入. owner=None 不注入, policy 按 create new 放行
        allowed_client_ids = (owner_user_id,) if owner_user_id else ()
    elif data_scope.type == "assigned":
        allowed_client_ids = data_scope.allowed_client_ids

    return Scope(
        allowed_client_ids=allowed_client_ids,
        guardian_of_user_ids=org.guardian_of_user_ids,
        # 督导下属的 supervisee 只在 supervisor 身份下生效
        supervised_user_ids=(
            org.supervisee_user_ids if (org.is_supervisor or org.full_practice_access) else ()
        ),
    )


def _do_authorize(
    user: AuthUser,
    org: OrgContext,
    data_scope: DataScope,
    action: str,
    selector: ResourceSelector,
    owner_user_id: str | None,
    org_id_override: str | None,
) -> None:
    """共享决策核心 (require_action 与 assert_authorized 都走它)。"""
    if user.is_system_admin:
        return  # bypass

    actor = _resolve_actor(user, org)
    org_id = org_id_override if org_id_override is not None else org.org_id
    resource = Resource(
        type=selector.type,
        data_class=selector.data_class,
        owner_user_id=owner_user_id,
        org_id=org_id,
    )
    scope = _resolve_scope(org, data_scope, owner_user_id)

    decision = authorize(actor, action, resource, scope)
    if not decision.allowed:
        raise _forbidden(f"action_denied:{action}/{selector.type}:{decision.reason or 'unknown'}")
    # Phase 1.7 (phi_access middleware): 在此处把 decision.snapshot 落 phi_access_logs


# ─── require_action factory (preHandler 风格) ─────────────────────


def require_action(action: str, selector: ResourceSelector) -> Callable[..., Any]:
    """
    返回一个 FastAPI Dependency, 挂在路由的 dependencies=[] 上做 RBAC 守门。

    Dependency 内部依赖 get_current_user / get_org_context / get_data_scope —
    FastAPI 会自动 resolve (拿不到任一 dep 的话, 整个守门流程不执行)。
    """

    async def dep(
        request: Request,
        user: Annotated[AuthUser, Depends(get_current_user)],
        org: Annotated[OrgContext | None, Depends(get_org_context)],
        data_scope: Annotated[DataScope | None, Depends(get_data_scope)],
    ) -> None:
        # System admin bypass — 与 Node authorize.ts:46 一致, 在调 actor/scope 解析前。
        # 注: get_org_context/get_data_scope 也对 sysadm 返回 None, 所以即便在 stub 阶段
        # (Phase 1.5/1.6 未实装) sysadm 路径也走得通。
        if user.is_system_admin:
            return

        if org is None or data_scope is None:
            # 非 sysadm 但 org/scope 未 resolve → 路由层缺 org context middleware
            raise _forbidden("org_context_required")

        owner_user_id: str | None = None
        if selector.extract_owner_user_id is not None:
            owner_user_id = selector.extract_owner_user_id(request)

        org_id_override: str | None = None
        if selector.extract_org_id is not None:
            org_id_override = selector.extract_org_id(request)

        _do_authorize(user, org, data_scope, action, selector, owner_user_id, org_id_override)

    return dep


# ─── assert_authorized (inline 在 handler 内调) ──────────────────


def assert_authorized(
    *,
    user: AuthUser,
    org: OrgContext | None,
    data_scope: DataScope | None,
    action: str,
    selector: ResourceSelector,
    owner_user_id: str | None,
    org_id: str | None = None,
) -> None:
    """
    Inline 版: 路由 handler 内调用。用于 ownerUserId 必须先查 DB 才知道的场景
    (e.g. session-note 的 client_id 来自查到的 note 行)。

    与 require_action 走同一个决策核心 (`_do_authorize`), 行为完全一致。

    org / data_scope 允许 None (与 Dependency 版对齐): system_admin 跳, 其他人
    缺 org context 直接 403。
    """
    if user.is_system_admin:
        return
    if org is None or data_scope is None:
        raise _forbidden("org_context_required")
    _do_authorize(user, org, data_scope, action, selector, owner_user_id, org_id)
