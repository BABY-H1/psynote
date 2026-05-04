"""
PHI Data Classification — 镜像 packages/shared/src/auth/data-class.ts。

心理行业数据高敏, "数据范围 (scope)" 之外再套 "数据密级", 不同角色可触达的
密级边界硬编码在此 (不放 UI 给机构管理员改, 防授权漂移)。

  phi_full        临床原文 (逐字稿/病程/完整测评/AI 对话原文)
  phi_summary     临床摘要 (结案报告/督导意见/干预建议摘要)
  de_identified   去标识化 (研判分流统计/无姓名教学材料)
  aggregate       聚合统计 (EAP/学校年级指标/匿名率)
  self_only       仅本人 (自己的测评/预约/心情日记)
  guardian_scope  监护范围 (家长能看的孩子数据子集, 不含逐字稿)

不是线性链, 是交叉覆盖图: staff 子集 phi_full..aggregate, subject 仅 self_only,
proxy 仅 guardian_scope, 部分 staff (班主任/分管领导) 被限到 de_identified/aggregate。
"""

from __future__ import annotations

from typing import Literal, get_args

DataClass = Literal[
    "phi_full",
    "phi_summary",
    "de_identified",
    "aggregate",
    "self_only",
    "guardian_scope",
]
DATA_CLASSES: tuple[DataClass, ...] = get_args(DataClass)


# Role → 可触达 data class 白名单。
# 单点放开走 org_members.access_profile.dataClasses (在 Actor.effective_data_classes
# 字段传入 authorize, 优先级高于此默认表)。
ROLE_DATA_CLASS_POLICY: dict[str, tuple[DataClass, ...]] = {
    # ─── School ────────────────────────────────────
    "school_admin": ("phi_summary", "de_identified", "aggregate"),
    # 分管领导只看聚合, 防一把手翻个案
    "school_leader": ("aggregate",),
    "psychologist": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    # 班主任不看临床原文, 只 de-id + 聚合
    "homeroom_teacher": ("de_identified", "aggregate"),
    "student": ("self_only",),
    "parent": ("guardian_scope",),
    # ─── Counseling ────────────────────────────────
    # 严格合规: clinic_admin 默认不直读 phi_full, 走 access_profile 单点开通。
    "clinic_admin": ("phi_summary", "de_identified", "aggregate"),
    "supervisor": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    "counselor": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    "client": ("self_only",),
    # ─── Enterprise ────────────────────────────────
    # HR 只看聚合, 合规硬红线
    "hr_admin": ("aggregate",),
    "eap_consultant": ("phi_full", "phi_summary", "de_identified"),
    "employee": ("self_only",),
    # ─── Solo ──────────────────────────────────────
    "owner": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    # ─── Hospital (占位) ───────────────────────────
    "hospital_admin": ("phi_summary", "de_identified", "aggregate"),
    "attending": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    "resident": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    "nurse": ("phi_summary", "de_identified", "aggregate"),
    "patient": ("self_only",),
    "family": ("guardian_scope",),
}


def role_allows_data_class(role: str, cls: str) -> bool:
    """该角色是否允许触达某数据密级 (纯 policy 层, 不涉 scope)。未知 role fail-closed。"""
    allowed = ROLE_DATA_CLASS_POLICY.get(role)
    if allowed is None:
        return False
    return cls in allowed
