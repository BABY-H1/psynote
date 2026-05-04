"""
Action 权限动作词表 — 镜像 packages/shared/src/auth/actions.ts。

刻意粗粒度 (10 个左右), 只覆盖 "角色-能力粗筛"。细粒度业务动作 (e.g.
"发布筛查测评" vs "发布干预性测评") 不在这层, 走具体路由的业务判断。
"""

from __future__ import annotations

from typing import Literal, get_args

Action = Literal[
    "view",
    "edit",
    "create",
    "delete",
    "sign_off",  # 签字 (危机案/督导审核)
    "export",  # 导出 (数据出口)
    "publish",  # 发布 (测评/课程上线)
    "assign",  # 派单 / 分派咨询师
    "override_risk_level",  # 覆盖 AI 判级
    "invite_member",
    "manage_license",  # 机构许可 / 计费
    "manage_org_settings",  # 改机构品牌 / 配置
]
ACTIONS: tuple[Action, ...] = get_args(Action)


# Role × Action 粗筛白名单。未在表上的 (role, action) 组合 → fail-closed。
# 这张表只决定 "该角色能否在语义上做这个动作", 不考虑资源归属/数据密级/scope —
# 那些由 authorize() 的后两道处理。
ROLE_ACTION_WHITELIST: dict[str, tuple[Action, ...]] = {
    # ─── School ──────────────────────────────────
    "school_admin": (
        "view",
        "edit",
        "create",
        "delete",
        "sign_off",
        "export",
        "publish",
        "assign",
        "override_risk_level",
        "invite_member",
        "manage_license",
        "manage_org_settings",
    ),
    "school_leader": ("view", "export"),  # 分管领导只读聚合
    "psychologist": (
        "view",
        "edit",
        "create",
        "sign_off",
        "publish",
        "assign",
        "override_risk_level",
    ),
    # 班主任只看班级, 可为自己班发测评 (业务层二次校验)
    "homeroom_teacher": ("view", "publish"),
    "student": ("view",),
    "parent": ("view",),
    # ─── Counseling ──────────────────────────────
    "clinic_admin": (
        "view",
        "edit",
        "create",
        "delete",
        "sign_off",
        "export",
        "publish",
        "assign",
        "override_risk_level",
        "invite_member",
        "manage_license",
        "manage_org_settings",
    ),
    "supervisor": (
        "view",
        "edit",
        "create",
        "sign_off",
        "export",
        "publish",
        "assign",
        "override_risk_level",
    ),
    "counselor": ("view", "edit", "create", "publish", "override_risk_level"),
    "client": ("view",),
    # ─── Enterprise ──────────────────────────────
    "hr_admin": ("view", "export", "invite_member", "manage_license", "manage_org_settings"),
    "eap_consultant": (
        "view",
        "edit",
        "create",
        "sign_off",
        "publish",
        "assign",
        "override_risk_level",
    ),
    "employee": ("view",),
    # ─── Solo ────────────────────────────────────
    "owner": (
        "view",
        "edit",
        "create",
        "delete",
        "sign_off",
        "export",
        "publish",
        "assign",
        "override_risk_level",
        "invite_member",
        "manage_license",
        "manage_org_settings",
    ),
    # ─── Hospital (占位) ─────────────────────────
    "hospital_admin": (
        "view",
        "edit",
        "create",
        "export",
        "invite_member",
        "manage_license",
        "manage_org_settings",
    ),
    "attending": (
        "view",
        "edit",
        "create",
        "sign_off",
        "publish",
        "assign",
        "override_risk_level",
    ),
    "resident": ("view", "edit", "create"),
    "nurse": ("view", "edit"),
    "patient": ("view",),
    "family": ("view",),
}


def role_can_perform_action(role: str, action: str) -> bool:
    """未知 role fail-closed。"""
    allowed = ROLE_ACTION_WHITELIST.get(role)
    if allowed is None:
        return False
    return action in allowed
