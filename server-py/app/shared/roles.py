"""
Role (V2) — 镜像 packages/shared/src/auth/roles.ts。

Per-OrgType 角色字典 + Principal 映射 + legacy → V2 角色翻译。

设计:
  1. 每 OrgType 有自己的合法角色集, DB CHECK constraint 防跨类型串
  2. 角色名具体 + 语义明确 (宁多不糊)
  3. legacy `org_admin` / `counselor` / `client` 在 RoleV2 体系下按 OrgType 拆开
"""

from __future__ import annotations

from typing import Literal, get_args

from app.shared.principal import Principal

# ─── School (学校) ────────────────────────────────────────────────
SchoolRole = Literal[
    "school_admin",  # 校级管理员
    "school_leader",  # 分管领导, 只看聚合
    "psychologist",  # 心理老师
    "homeroom_teacher",  # 班主任, 只看自己班级去标识化
    "student",  # 学生 (subject)
    "parent",  # 家长 (proxy)
]
SCHOOL_ROLES: tuple[SchoolRole, ...] = get_args(SchoolRole)

# ─── Counseling (咨询中心) ────────────────────────────────────────
CounselingRole = Literal[
    "clinic_admin",  # 默认不直读 phi_full, 走 access_profile 单点开通
    "supervisor",
    "counselor",
    "client",  # 来访者 (subject)
]
COUNSELING_ROLES: tuple[CounselingRole, ...] = get_args(CounselingRole)

# ─── Enterprise (企业 EAP) ────────────────────────────────────────
EnterpriseRole = Literal[
    "hr_admin",  # 只看聚合, 合规硬隔离
    "eap_consultant",
    "employee",  # 员工 (subject)
]
ENTERPRISE_ROLES: tuple[EnterpriseRole, ...] = get_args(EnterpriseRole)

# ─── Solo (个体咨询师) ────────────────────────────────────────────
SoloRole = Literal[
    "owner",  # 个体咨询师本人 (兼管理员 + 咨询师)
    "client",
]
SOLO_ROLES: tuple[SoloRole, ...] = get_args(SoloRole)

# ─── Hospital (医疗机构, 占位) ────────────────────────────────────
HospitalRole = Literal[
    "hospital_admin",
    "attending",
    "resident",
    "nurse",
    "patient",
    "family",
]
HOSPITAL_ROLES: tuple[HospitalRole, ...] = get_args(HospitalRole)

# 统一联合类型
RoleV2 = SchoolRole | CounselingRole | EnterpriseRole | SoloRole | HospitalRole

ROLES_BY_ORG_TYPE: dict[str, tuple[str, ...]] = {
    "school": SCHOOL_ROLES,
    "counseling": COUNSELING_ROLES,
    "enterprise": ENTERPRISE_ROLES,
    "solo": SOLO_ROLES,
    "hospital": HOSPITAL_ROLES,
}


def is_role_valid_for_org_type(org_type: str, role: str) -> bool:
    """校验 role 是否在给定 OrgType 的合法集里。未知 OrgType 返回 False。"""
    allowed = ROLES_BY_ORG_TYPE.get(org_type)
    if allowed is None:
        return False
    return role in allowed


# ─── Role → Principal 映射 ───────────────────────────────────────

# 显式声明哪些 RoleV2 是 subject / proxy 类。用 frozenset[str] (不是 RoleV2 union)
# 是因为 isinstance 检查 + drift 测试方便。tests/shared/test_roles.py 强制
# _SUBJECT_ROLES ∪ _PROXY_ROLES ⊆ RoleV2 全集; 加 RoleV2 时 mypy + 测试都会
# 提醒分类 (默认 staff, 但显式分类比默认安全)。
_SUBJECT_ROLES: frozenset[str] = frozenset({"client", "student", "employee", "patient"})
_PROXY_ROLES: frozenset[str] = frozenset({"parent", "family"})


def principal_of(role: str) -> Principal:
    """
    Role → Principal (staff/subject/proxy) 映射, 用于决定登录入口与 Portal tab 集。

    未知 role 默认 staff (mirrors TS default branch). 但 fail-closed 由调用方
    再次校验 role 合法性 (is_role_valid_for_org_type), 这里只做分类。
    """
    if role in _SUBJECT_ROLES:
        return "subject"
    if role in _PROXY_ROLES:
        return "proxy"
    return "staff"


# ─── Legacy OrgRole → RoleV2 映射 ───────────────────────────────

LegacyRole = Literal["org_admin", "counselor", "client"]


def legacy_role_to_v2(
    org_type: str,
    legacy_role: str,
    *,
    is_guardian_account: bool = False,
) -> str:
    """
    org_members.role_v2 为空时, 用 legacy role 推一个保守 RoleV2 值。

    映射规则 (与 packages/shared/src/auth/roles.ts legacyRoleToV2 一一对齐):
      - org_admin: school→school_admin / counseling→clinic_admin /
        enterprise→hr_admin (合规硬隔离!) / solo→owner / hospital→hospital_admin
      - counselor: school→psychologist / counseling→counselor /
        enterprise→eap_consultant / solo→owner / hospital→attending
      - client: school→student (除非 guardian → parent),
        counseling→client, enterprise→employee, solo→client,
        hospital→patient (除非 guardian → family)

    is_guardian_account 仅在 client + (school|hospital) 下生效。
    """
    if legacy_role == "org_admin":
        return {
            "school": "school_admin",
            "counseling": "clinic_admin",
            "enterprise": "hr_admin",
            "solo": "owner",
            "hospital": "hospital_admin",
        }.get(org_type, "client")  # 未知 OrgType fail-soft

    if legacy_role == "counselor":
        return {
            "school": "psychologist",
            "counseling": "counselor",
            "enterprise": "eap_consultant",
            "solo": "owner",
            "hospital": "attending",
        }.get(org_type, "counselor")

    # legacy_role == "client"
    if org_type == "school":
        return "parent" if is_guardian_account else "student"
    if org_type == "hospital":
        return "family" if is_guardian_account else "patient"
    if org_type == "enterprise":
        return "employee"
    return "client"  # counseling / solo
