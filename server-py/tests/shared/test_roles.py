"""
Tests for app/shared/roles.py — 镜像 packages/shared/src/auth/__tests__/roles.test.ts。

RoleV2 per-orgType 字典 + principal_of + legacy_role_to_v2 映射。
"""

from __future__ import annotations

# ─── is_role_valid_for_org_type ─────────────────────────────────


def test_school_does_not_accept_counselor() -> None:
    """学校用 psychologist, 不用 counselor"""
    from app.shared.roles import is_role_valid_for_org_type

    assert is_role_valid_for_org_type("school", "counselor") is False


def test_counseling_does_not_accept_homeroom_teacher() -> None:
    from app.shared.roles import is_role_valid_for_org_type

    assert is_role_valid_for_org_type("counseling", "homeroom_teacher") is False


def test_enterprise_does_not_accept_client_counselor_student() -> None:
    """企业用 employee/eap_consultant, 不混用其他 OrgType 角色"""
    from app.shared.roles import is_role_valid_for_org_type

    assert is_role_valid_for_org_type("enterprise", "client") is False
    assert is_role_valid_for_org_type("enterprise", "counselor") is False
    assert is_role_valid_for_org_type("enterprise", "student") is False


def test_valid_combinations_pass() -> None:
    from app.shared.roles import is_role_valid_for_org_type

    cases = [
        ("school", "psychologist"),
        ("school", "student"),
        ("school", "parent"),
        ("counseling", "counselor"),
        ("counseling", "supervisor"),
        ("enterprise", "hr_admin"),
        ("enterprise", "eap_consultant"),
        ("enterprise", "employee"),
        ("solo", "owner"),
        ("solo", "client"),
    ]
    for org_type, role in cases:
        assert is_role_valid_for_org_type(org_type, role) is True, f"{org_type}/{role}"


def test_unknown_org_type_or_role_returns_false() -> None:
    from app.shared.roles import is_role_valid_for_org_type

    assert is_role_valid_for_org_type("school", "bogus_role") is False
    assert is_role_valid_for_org_type("bogus-org", "counselor") is False
    assert is_role_valid_for_org_type("counseling", "") is False


# ─── ROLES_BY_ORG_TYPE 完整性 ───────────────────────────────────


def test_each_org_type_has_staff_and_subject_or_proxy() -> None:
    from app.shared.roles import ROLES_BY_ORG_TYPE, principal_of

    for org_type, roles in ROLES_BY_ORG_TYPE.items():
        principals = [principal_of(r) for r in roles]
        assert "staff" in principals, f"{org_type} 缺 staff"
        assert any(p in ("subject", "proxy") for p in principals), f"{org_type} 缺 subject/proxy"


def test_role_lists_have_no_duplicates() -> None:
    from app.shared.roles import (
        COUNSELING_ROLES,
        ENTERPRISE_ROLES,
        HOSPITAL_ROLES,
        SCHOOL_ROLES,
        SOLO_ROLES,
    )

    for lst in (
        SCHOOL_ROLES,
        COUNSELING_ROLES,
        ENTERPRISE_ROLES,
        SOLO_ROLES,
        HOSPITAL_ROLES,
    ):
        assert len(set(lst)) == len(lst)


# ─── principal_of ───────────────────────────────────────────────


def test_subject_roles() -> None:
    """client/student/employee/patient → subject"""
    from app.shared.roles import principal_of

    for role in ("client", "student", "employee", "patient"):
        assert principal_of(role) == "subject", role


def test_proxy_roles() -> None:
    """parent/family → proxy"""
    from app.shared.roles import principal_of

    for role in ("parent", "family"):
        assert principal_of(role) == "proxy", role


def test_staff_roles() -> None:
    """所有管理/执业岗位 → staff"""
    from app.shared.roles import principal_of

    staff_roles = [
        "school_admin",
        "school_leader",
        "psychologist",
        "homeroom_teacher",
        "clinic_admin",
        "supervisor",
        "counselor",
        "hr_admin",
        "eap_consultant",
        "owner",
        "attending",
        "nurse",
    ]
    for role in staff_roles:
        assert principal_of(role) == "staff", role


# ─── Drift prevention: _SUBJECT_ROLES / _PROXY_ROLES ⊆ RoleV2 全集 ─


def test_subject_and_proxy_role_sets_are_subset_of_rolev2() -> None:
    """
    _SUBJECT_ROLES + _PROXY_ROLES 必须是合法 RoleV2 子集。

    防 drift 场景: 如果 RoleV2 union 增删了角色 (e.g. 新增 'volunteer'),
    但忘了在 _SUBJECT_ROLES / _PROXY_ROLES 里分类, principal_of 会默认
    返回 'staff' (fail-open). 这条测试不能直接防那种情况, 但保证现有集合
    里的字符串都是合法 RoleV2 (catch typo / stale string).
    """
    from app.shared.roles import (
        _PROXY_ROLES,
        _SUBJECT_ROLES,
        ROLES_BY_ORG_TYPE,
    )

    all_role_v2: set[str] = set()
    for roles in ROLES_BY_ORG_TYPE.values():
        all_role_v2.update(roles)

    bad_subjects = _SUBJECT_ROLES - all_role_v2
    bad_proxies = _PROXY_ROLES - all_role_v2
    assert not bad_subjects, f"_SUBJECT_ROLES 含未定义 RoleV2: {bad_subjects}"
    assert not bad_proxies, f"_PROXY_ROLES 含未定义 RoleV2: {bad_proxies}"


def test_every_subject_proxy_role_classified_in_principal_of() -> None:
    """每个 _SUBJECT_ROLES / _PROXY_ROLES 成员经 principal_of 应正确返回。"""
    from app.shared.roles import _PROXY_ROLES, _SUBJECT_ROLES, principal_of

    for role in _SUBJECT_ROLES:
        assert principal_of(role) == "subject", f"{role} 应是 subject"
    for role in _PROXY_ROLES:
        assert principal_of(role) == "proxy", f"{role} 应是 proxy"


# ─── legacy_role_to_v2 ──────────────────────────────────────────


def test_legacy_school_org_admin() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("school", "org_admin") == "school_admin"


def test_legacy_school_counselor_becomes_psychologist() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("school", "counselor") == "psychologist"


def test_legacy_school_client_no_guardian_becomes_student() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("school", "client") == "student"


def test_legacy_school_client_with_guardian_becomes_parent() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("school", "client", is_guardian_account=True) == "parent"


def test_legacy_counseling_client_stays_client() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("counseling", "client") == "client"


def test_legacy_enterprise_org_admin_becomes_hr_admin() -> None:
    """合规硬隔离: 企业 org_admin 必须是 hr_admin (不能直读 PHI)"""
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("enterprise", "org_admin") == "hr_admin"


def test_legacy_enterprise_counselor_becomes_eap_consultant() -> None:
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("enterprise", "counselor") == "eap_consultant"


def test_legacy_solo_org_admin_and_counselor_both_become_owner() -> None:
    """solo OrgType 一人兼任管理与执业, 全归 owner"""
    from app.shared.roles import legacy_role_to_v2

    assert legacy_role_to_v2("solo", "org_admin") == "owner"
    assert legacy_role_to_v2("solo", "counselor") == "owner"
