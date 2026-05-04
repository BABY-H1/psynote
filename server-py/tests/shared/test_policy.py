"""
Tests for app/shared/policy.py — 镜像 packages/shared/src/auth/__tests__/policy.test.ts。

3 道权限检查纯函数:
  1. Role × Action 白名单粗筛
  2. Data Class 匹配 (effective 优先, fallback role policy)
  3. Scope 匹配 (按 dataClass 语义: self_only / guardian_scope / phi_full ...)

Fail-closed 约定: 任一道失败 → allowed=False + reason 字段。
"""

from __future__ import annotations

# ─── Test fixtures ──────────────────────────────────────────────

CLIENT_ID = "user-client-001"
STUDENT_ID = "user-student-001"
SUPERVISEE_CLIENT = "user-client-002"
OTHER_CLIENT = "user-client-999"


def _counselor_actor(**overrides: object):
    from app.shared.policy import Actor

    defaults = {
        "org_type": "counseling",
        "role": "counselor",
        "user_id": "user-counselor-001",
    }
    defaults.update(overrides)
    return Actor(**defaults)  # type: ignore[arg-type]


def _teacher_actor():
    from app.shared.policy import Actor

    return Actor(org_type="school", role="homeroom_teacher", user_id="user-teacher-001")


def _leader_actor():
    from app.shared.policy import Actor

    return Actor(org_type="school", role="school_leader", user_id="user-leader-001")


def _parent_actor():
    from app.shared.policy import Actor

    return Actor(org_type="school", role="parent", user_id="user-parent-001")


def _student_actor(user_id: str = STUDENT_ID):
    from app.shared.policy import Actor

    return Actor(org_type="school", role="student", user_id=user_id)


def _hr_actor():
    from app.shared.policy import Actor

    return Actor(org_type="enterprise", role="hr_admin", user_id="user-hr-001")


def _resource(data_class: str, owner_user_id: str | None = None):
    from app.shared.policy import Resource

    return Resource(type="test", data_class=data_class, owner_user_id=owner_user_id)


# ─── 1. Role × Action 粗筛 ─────────────────────────────────────


def test_counselor_cannot_manage_license() -> None:
    """admin-only 动作"""
    from app.shared.policy import authorize

    decision = authorize(_counselor_actor(), "manage_license", _resource("aggregate"))
    assert decision.allowed is False
    assert decision.reason is not None
    assert "role_cannot_perform_action" in decision.reason


def test_clinic_admin_cannot_view_phi_full_by_default() -> None:
    """严格合规默认 — 需 access_profile 单点开通"""
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(org_type="counseling", role="clinic_admin", user_id="u")
    decision = authorize(
        actor,
        "view",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is False
    assert decision.reason is not None
    assert "role_data_class_not_allowed" in decision.reason


def test_clinic_admin_can_view_phi_summary() -> None:
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(org_type="counseling", role="clinic_admin", user_id="u")
    decision = authorize(
        actor,
        "view",
        _resource("phi_summary", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True


def test_counselor_can_view_phi_full_for_assigned_client() -> None:
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(org_type="counseling", role="counselor", user_id="u")
    decision = authorize(
        actor,
        "view",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True


def test_supervisor_can_sign_off() -> None:
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(org_type="counseling", role="supervisor", user_id="u-sup")
    decision = authorize(
        actor,
        "sign_off",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True


# ─── 2. Data Class 匹配 ───────────────────────────────────────


def test_homeroom_teacher_blocked_from_phi_full() -> None:
    from app.shared.policy import authorize

    decision = authorize(_teacher_actor(), "view", _resource("phi_full", STUDENT_ID))
    assert decision.allowed is False
    assert decision.reason is not None
    assert "role_data_class_not_allowed" in decision.reason


def test_homeroom_teacher_allowed_de_identified() -> None:
    """de_identified 不做 owner 匹配, 不需 scope"""
    from app.shared.policy import authorize

    decision = authorize(_teacher_actor(), "view", _resource("de_identified"))
    assert decision.allowed is True


def test_leader_blocked_from_individual_records() -> None:
    """分管领导只看 aggregate, 不能直翻个案"""
    from app.shared.policy import authorize

    for cls in ("phi_full", "phi_summary", "de_identified"):
        decision = authorize(_leader_actor(), "view", _resource(cls, STUDENT_ID))
        assert decision.allowed is False, cls


def test_leader_allowed_aggregate() -> None:
    from app.shared.policy import authorize

    decision = authorize(_leader_actor(), "view", _resource("aggregate"))
    assert decision.allowed is True


def test_hr_admin_blocked_from_phi_summary() -> None:
    """合规硬红线: HR 只能聚合"""
    from app.shared.policy import authorize

    decision = authorize(_hr_actor(), "view", _resource("phi_summary", "emp-1"))
    assert decision.allowed is False
    assert decision.reason is not None
    assert "role_data_class_not_allowed" in decision.reason


# ─── 3. Scope: self_only ──────────────────────────────────────


def test_student_views_own_assessment() -> None:
    from app.shared.policy import authorize

    decision = authorize(_student_actor(STUDENT_ID), "view", _resource("self_only", STUDENT_ID))
    assert decision.allowed is True


def test_student_blocked_from_others_assessment() -> None:
    from app.shared.policy import authorize

    decision = authorize(
        _student_actor(STUDENT_ID),
        "view",
        _resource("self_only", "user-other-student"),
    )
    assert decision.allowed is False
    assert decision.reason == "scope_not_self"


def test_self_only_with_null_owner_rejected() -> None:
    from app.shared.policy import authorize

    decision = authorize(_student_actor(STUDENT_ID), "view", _resource("self_only", None))
    assert decision.allowed is False


# ─── 3. Scope: guardian_scope ─────────────────────────────────


CHILD_A = "user-child-a"
CHILD_B = "user-child-b"


def test_parent_views_own_child() -> None:
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _parent_actor(),
        "view",
        _resource("guardian_scope", CHILD_A),
        Scope(guardian_of_user_ids=(CHILD_A,)),
    )
    assert decision.allowed is True


def test_parent_blocked_from_other_child() -> None:
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _parent_actor(),
        "view",
        _resource("guardian_scope", CHILD_B),
        Scope(guardian_of_user_ids=(CHILD_A,)),
    )
    assert decision.allowed is False
    assert decision.reason == "scope_not_guardian"


def test_parent_with_empty_scope_rejected() -> None:
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _parent_actor(),
        "view",
        _resource("guardian_scope", CHILD_A),
        Scope(),
    )
    assert decision.allowed is False


# ─── 3. Scope: assigned/supervised for phi_full/phi_summary ────


def test_counselor_views_assigned_client_phi_full() -> None:
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _counselor_actor(),
        "view",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True


def test_counselor_blocked_from_unassigned_client() -> None:
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _counselor_actor(),
        "view",
        _resource("phi_full", OTHER_CLIENT),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is False
    assert decision.reason == "scope_not_assigned"


def test_supervisor_can_view_supervisee_clients() -> None:
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(org_type="counseling", role="supervisor", user_id="u-sup")
    decision = authorize(
        actor,
        "view",
        _resource("phi_full", SUPERVISEE_CLIENT),
        Scope(allowed_client_ids=(), supervised_user_ids=(SUPERVISEE_CLIENT,)),
    )
    assert decision.allowed is True


def test_creating_new_resource_with_null_owner_allowed() -> None:
    """创建新资源时还没 ownerUserId, 交业务层复查"""
    from app.shared.policy import authorize

    decision = authorize(_counselor_actor(), "create", _resource("phi_full", None))
    assert decision.allowed is True


# ─── Fail-closed 边界 ─────────────────────────────────────────


def test_actor_with_empty_role_rejected() -> None:
    from app.shared.policy import Actor, authorize

    actor = Actor(org_type="counseling", role="", user_id="u")
    decision = authorize(actor, "view", _resource("aggregate"))
    assert decision.allowed is False
    assert decision.reason == "no_actor_role"


def test_unknown_role_rejected() -> None:
    """fail-closed: 字典里没的 role"""
    from app.shared.policy import Actor, authorize

    actor = Actor(org_type="counseling", role="bogus_role", user_id="u")
    decision = authorize(actor, "view", _resource("aggregate"))
    assert decision.allowed is False


def test_decision_snapshot_on_success() -> None:
    """通过时返回 snapshot, 供审计日志"""
    from app.shared.policy import Scope, authorize

    decision = authorize(
        _counselor_actor(),
        "view",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True
    assert decision.snapshot == {
        "role": "counselor",
        "principal": "staff",
        "data_class": "phi_full",
    }


# ─── ROLE_DATA_CLASS_POLICY 完整性 ─────────────────────────────


def test_every_role_has_at_least_one_data_class() -> None:
    from app.shared.data_class import ROLE_DATA_CLASS_POLICY

    for role, classes in ROLE_DATA_CLASS_POLICY.items():
        assert len(classes) > 0, f"role {role} 没有可访问的 data class"


def test_subject_roles_only_self_only() -> None:
    from app.shared.data_class import ROLE_DATA_CLASS_POLICY

    for role in ("client", "student", "employee", "patient"):
        assert ROLE_DATA_CLASS_POLICY[role] == ("self_only",), role


def test_proxy_roles_only_guardian_scope() -> None:
    from app.shared.data_class import ROLE_DATA_CLASS_POLICY

    for role in ("parent", "family"):
        assert ROLE_DATA_CLASS_POLICY[role] == ("guardian_scope",), role


def test_hr_admin_hard_red_line_aggregate_only() -> None:
    """合规硬红线: HR 只能 aggregate, 不能任何 PHI"""
    from app.shared.data_class import ROLE_DATA_CLASS_POLICY, role_allows_data_class

    assert ROLE_DATA_CLASS_POLICY["hr_admin"] == ("aggregate",)
    assert role_allows_data_class("hr_admin", "phi_full") is False
    assert role_allows_data_class("hr_admin", "phi_summary") is False
    assert role_allows_data_class("hr_admin", "de_identified") is False


def test_school_leader_hard_red_line_aggregate_only() -> None:
    from app.shared.data_class import ROLE_DATA_CLASS_POLICY

    assert ROLE_DATA_CLASS_POLICY["school_leader"] == ("aggregate",)


# ─── effective_data_classes 单点放开 ────────────────────────────


def test_effective_data_classes_overrides_role_policy() -> None:
    """clinic_admin 默认无 phi_full, 但 effective_data_classes 单点开通后允许"""
    from app.shared.policy import Actor, Scope, authorize

    actor = Actor(
        org_type="counseling",
        role="clinic_admin",
        user_id="u",
        effective_data_classes=("phi_full", "phi_summary", "de_identified", "aggregate"),
    )
    decision = authorize(
        actor,
        "view",
        _resource("phi_full", CLIENT_ID),
        Scope(allowed_client_ids=(CLIENT_ID,)),
    )
    assert decision.allowed is True


def test_effective_data_classes_can_restrict_below_role_default() -> None:
    """反向: effective 为空集 → 比 role 默认更紧"""
    from app.shared.policy import Actor, authorize

    actor = Actor(
        org_type="counseling",
        role="counselor",
        user_id="u",
        effective_data_classes=(),  # 显式空 → 全拒
    )
    decision = authorize(actor, "view", _resource("phi_full", CLIENT_ID))
    assert decision.allowed is False
