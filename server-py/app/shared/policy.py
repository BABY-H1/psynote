"""
authorize() — 三道检查的纯函数权限决策器。

镜像 packages/shared/src/auth/policy.ts 的 authorize / Decision 行为, 1:1 对齐。

三道检查:
  1. Role × Action 白名单粗筛
  2. Data Class 匹配 (effective_data_classes 优先, fallback role 默认策略)
  3. Scope 匹配 (按 dataClass 语义):
     - self_only      ownerUserId 必须 == actor.user_id
     - guardian_scope ownerUserId 必须 ∈ scope.guardian_of_user_ids
     - phi_full/phi_summary  ownerUserId 必须 ∈ allowed_client_ids ∪ supervised_user_ids
                              (None ownerUserId → 允许, 创建新资源场景由业务层复查)
     - de_identified/aggregate  不做个体匹配

Fail-closed: 任一道失败 → allowed=False + reason 字段。

纯函数, 无 IO, O(1) → 可在请求热路径上自由调用。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.shared.actions import Action, role_can_perform_action
from app.shared.data_class import DataClass, role_allows_data_class
from app.shared.roles import RoleV2, principal_of
from app.shared.tier import OrgType


@dataclass(frozen=True)
class Actor:
    """权限决策的主体 — 当前请求的用户在某 org 的角色身份。

    `org_type` / `role` 用 Literal 类型, 保证调用方拿到的是 RoleV2 / OrgType
    enum 值 (来自 `OrgContext.role_v2` 与 `org_type`)。负向测试构造非法 role 时
    用 `# type: ignore` 越过 mypy。
    """

    org_type: OrgType
    role: RoleV2
    user_id: str
    is_supervisor: bool = False
    # role 默认策略 + access_profile 单点放开 = 实际可触达的 data class。
    # 不传 → 走 ROLE_DATA_CLASS_POLICY[role] 默认。传空 tuple → 显式全拒。
    effective_data_classes: tuple[DataClass, ...] | None = None


@dataclass(frozen=True)
class Resource:
    """被访问的资源元数据 — 决策只看 data_class + owner_user_id, 不看 type/org_id。"""

    type: str  # 仅日志/审计用 (任意字符串, 不是 enum)
    data_class: DataClass
    owner_user_id: str | None = None
    org_id: str | None = None  # 暂未参与决策, 保留扩展


@dataclass(frozen=True)
class Scope:
    """Actor 在本次请求的可见范围 — 由外层 (data_scope middleware) resolve 后传入。"""

    allowed_client_ids: tuple[str, ...] = field(default_factory=tuple)
    supervised_user_ids: tuple[str, ...] = field(default_factory=tuple)
    guardian_of_user_ids: tuple[str, ...] = field(default_factory=tuple)
    homeroom_class_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str | None = None
    # 通过时返回的快照, 写审计日志用 (PHI access log)
    snapshot: dict[str, str] | None = None


def authorize(
    actor: Actor,
    action: Action,
    resource: Resource,
    scope: Scope | None = None,
) -> Decision:
    """3 道检查 + fail-closed。任一失败立刻返回 (短路)。"""
    # ── 0. 防御 — actor.role 必填
    if not actor or not actor.role:
        return Decision(allowed=False, reason="no_actor_role")

    # ── 1. Role × Action 粗筛
    if not role_can_perform_action(actor.role, action):
        return Decision(
            allowed=False,
            reason=f"role_cannot_perform_action:{actor.role}/{action}",
        )

    # ── 2. Data Class 匹配
    # effective_data_classes 优先 (单点放开场景), 否则 fallback role 默认策略。
    # 显式传空 tuple 也算 "用户提供了" → 全拒 (比 role 默认更紧)。
    if actor.effective_data_classes is not None:
        data_class_allowed = resource.data_class in actor.effective_data_classes
    else:
        data_class_allowed = role_allows_data_class(actor.role, resource.data_class)
    if not data_class_allowed:
        return Decision(
            allowed=False,
            reason=f"role_data_class_not_allowed:{actor.role}/{resource.data_class}",
        )

    # ── 3. Scope 匹配 (按 dataClass 语义)
    scope_decision = _check_scope(actor, resource, scope)
    if not scope_decision.allowed:
        return scope_decision

    # 通过
    return Decision(
        allowed=True,
        snapshot={
            "role": actor.role,
            "principal": principal_of(actor.role),
            "data_class": resource.data_class,
        },
    )


def _check_scope(
    actor: Actor,
    resource: Resource,
    scope: Scope | None,
) -> Decision:
    cls = resource.data_class
    owner_id = resource.owner_user_id
    s: Any = scope  # alias for None-safe access below

    # self_only — 必须是资源本人
    if cls == "self_only":
        if not owner_id or owner_id != actor.user_id:
            return Decision(allowed=False, reason="scope_not_self")
        return Decision(allowed=True)

    # guardian_scope — 必须是代理人且监护此 subject
    if cls == "guardian_scope":
        guardians = s.guardian_of_user_ids if s else ()
        if not owner_id or owner_id not in guardians:
            return Decision(allowed=False, reason="scope_not_guardian")
        return Decision(allowed=True)

    # phi_full / phi_summary — 个案级数据, assigned 或 supervised 才行
    if cls in ("phi_full", "phi_summary"):
        if owner_id is None:
            # 没 ownerUserId → 创建新资源场景, 业务层再校验
            return Decision(allowed=True)
        in_assigned = owner_id in s.allowed_client_ids if s else False
        in_supervised = owner_id in s.supervised_user_ids if s else False
        if in_assigned or in_supervised:
            return Decision(allowed=True)
        return Decision(allowed=False, reason="scope_not_assigned")

    # de_identified / aggregate — 个体已脱敏, 不做 owner 匹配
    if cls in ("de_identified", "aggregate"):
        return Decision(allowed=True)

    # 未知 dataClass → fail-closed
    return Decision(allowed=False, reason=f"unknown_data_class:{cls}")
