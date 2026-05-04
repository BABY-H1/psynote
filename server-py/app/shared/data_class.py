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

from typing import Literal, cast, get_args

from app.shared.roles import RoleV2

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
# 用 dict[RoleV2, ...] (而非 dict[str, ...]) 让 mypy 在拼错 / 漏 RoleV2 union 新增
# 角色时报错, 而不是运行时静默 fail-closed (见 role_allows_data_class)。
ROLE_DATA_CLASS_POLICY: dict[RoleV2, tuple[DataClass, ...]] = {
    # ─── School ────────────────────────────────────
    "school_admin": ("phi_summary", "de_identified", "aggregate"),
    # 分管领导只看聚合, 防一把手翻个案
    "school_leader": ("aggregate",),
    "psychologist": ("phi_full", "phi_summary", "de_identified", "aggregate"),
    # Phase 2 决策 2026-05-04: 班主任拿 phi_summary 摘要级别 (不是 phi_full 也不是
    # 仅 aggregate_only). 业务流: 心理老师评估完学生 → 主动生成"班主任摘要" →
    # 编辑 + 签字 → 推给班主任 (Phase 7+ Roadmap §4 班主任摘要审批 UI 才做完整流程).
    # 班主任阅读时自动写 phi_access_logs (PHI 访问审计追溯)。
    # 法规背书: PIPL 第 13 条「履行法定职责所必需」(义务教育法班级管理职责)
    # + GB/T 35273 5.4 c) 最小必要原则。
    "homeroom_teacher": ("phi_summary", "de_identified", "aggregate"),
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
    """该角色是否允许触达某数据密级 (纯 policy 层, 不涉 scope)。未知 role fail-closed。

    role 接受 str (动态来源, e.g. DB 老数据), 内部 cast 到 RoleV2 仅为 mypy 通过 —
    runtime 用 dict.get(unknown) → None 走 fail-closed 分支, 不影响安全。
    """
    allowed = ROLE_DATA_CLASS_POLICY.get(cast(RoleV2, role))
    if allowed is None:
        return False
    return cls in allowed
