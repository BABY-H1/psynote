"""
Phase 2.8 — metadata 反射对比测试 (75 Drizzle + 1 ai_credentials = 76 张表)。

不连真 DB, 只对比 ``Base.metadata.tables`` 与 Drizzle ``server/src/db/schema.ts``
的表名集合。捕获两类漂移:
  1. SQLAlchemy 模型缺了 Drizzle 表 → 翻译漏了
  2. SQLAlchemy 模型多了 Drizzle 没有的表 → 多余 (除了 ai_credentials)

真正的 alembic check / DB 反射对比 (DDL 级 — 字段类型 / nullable / FK / index)
留 Phase 6 切流前做 (那时有真 dev DB 可连)。
"""

from __future__ import annotations

import pytest

# 从 server/src/db/schema.ts 抽出的 75 张 Drizzle pgTable 表名 (snake_case)
# 顺序按 schema.ts 行号排, 便于 review 漏表
_DRIZZLE_75_TABLES: frozenset[str] = frozenset(
    {
        # Platform Layer
        "organizations",
        "users",
        "password_reset_tokens",
        "org_members",
        "client_profiles",
        # Assessment Domain
        "scales",
        "scale_dimensions",
        "dimension_rules",
        "scale_items",
        "assessments",
        "assessment_scales",
        "assessment_results",
        "assessment_batches",
        "assessment_reports",
        "distributions",
        # Counseling Domain
        "care_episodes",
        "care_timeline",
        "counselor_availability",
        "appointments",
        "reminder_settings",
        "note_templates",
        "session_notes",
        "note_attachments",
        "treatment_plans",
        "treatment_goal_library",
        "client_documents",
        # Followup
        "referrals",
        "follow_up_plans",
        "follow_up_reviews",
        # AI
        "ai_conversations",
        # Group Domain
        "group_schemes",
        "group_scheme_sessions",
        "group_instances",
        "group_enrollments",
        "group_session_records",
        "group_session_attendance",
        # Course Domain
        "courses",
        "course_chapters",
        "course_enrollments",
        "course_lesson_blocks",
        "course_template_tags",
        "course_content_blocks",
        "group_session_blocks",
        "enrollment_block_responses",
        "course_instances",
        "course_feedback_forms",
        "course_feedback_responses",
        "course_homework_defs",
        "course_homework_submissions",
        "course_interaction_responses",
        # Audit / Notification
        "compliance_reviews",
        "notifications",
        "audit_logs",
        "phi_access_logs",
        "user_role_audit",
        # Consent / Member
        "consent_templates",
        "consent_records",
        "service_intakes",
        "client_assignments",
        "client_access_grants",
        # EAP
        "eap_partnerships",
        "eap_counselor_assignments",
        "eap_employee_profiles",
        "eap_usage_events",
        "eap_crisis_alerts",
        # School
        "school_classes",
        "school_student_profiles",
        # Workflow
        "workflow_rules",
        "workflow_executions",
        "candidate_pool",
        # AI Logs / Crisis / Misc
        "ai_call_logs",
        "crisis_cases",
        "class_parent_invite_tokens",
        "client_relationships",
        "system_config",
    }
)


# Phase 2 决策 2026-05-04 新表 (不在 Drizzle, Alembic 0001 新建)
_PHASE2_NEW_TABLES: frozenset[str] = frozenset({"ai_credentials"})


def test_drizzle_75_count() -> None:
    """Drizzle 表名清单恰好 75 张 (跟 plan 文档一致)"""
    assert len(_DRIZZLE_75_TABLES) == 75, (
        f"清单 {len(_DRIZZLE_75_TABLES)} 张, plan 写 75 张, drift 了"
    )


def test_metadata_contains_all_75_drizzle_tables(base_env: pytest.MonkeyPatch) -> None:
    """SQLAlchemy 模型必须覆盖 Drizzle 全部 75 张表"""
    import app.db.models  # noqa: F401 — trigger registration
    from app.core.database import Base

    metadata_tables = set(Base.metadata.tables.keys())
    missing = _DRIZZLE_75_TABLES - metadata_tables
    assert not missing, f"SQLAlchemy 缺这些 Drizzle 表: {sorted(missing)}"


def test_metadata_no_unknown_extra_tables(base_env: pytest.MonkeyPatch) -> None:
    """SQLAlchemy 不能多无关表 (除了 Phase 2 决策新加的 ai_credentials)"""
    import app.db.models  # noqa: F401
    from app.core.database import Base

    metadata_tables = set(Base.metadata.tables.keys())
    expected = _DRIZZLE_75_TABLES | _PHASE2_NEW_TABLES
    extras = metadata_tables - expected
    assert not extras, f"SQLAlchemy 多了未声明的表: {sorted(extras)}"


def test_metadata_total_is_76(base_env: pytest.MonkeyPatch) -> None:
    """75 Drizzle + 1 ai_credentials = 76 张, 不多不少"""
    import app.db.models  # noqa: F401
    from app.core.database import Base

    assert len(Base.metadata.tables) == 76


def test_phase2_new_tables_present(base_env: pytest.MonkeyPatch) -> None:
    """Phase 2 决策新表必须存在"""
    import app.db.models  # noqa: F401
    from app.core.database import Base

    metadata_tables = set(Base.metadata.tables.keys())
    for t in _PHASE2_NEW_TABLES:
        assert t in metadata_tables, f"Phase 2 新表 {t} 缺失"


def test_organizations_has_phase2_columns(base_env: pytest.MonkeyPatch) -> None:
    """organizations 表必须含 Phase 2 决策加的 parent_org_id + org_level 列"""
    import app.db.models  # noqa: F401
    from app.core.database import Base

    org_table = Base.metadata.tables["organizations"]
    cols = {c.name for c in org_table.columns}
    assert "parent_org_id" in cols, "Phase 2 parent_org_id 字段缺"
    assert "org_level" in cols, "Phase 2 org_level 字段缺"


# ─── Naming convention 一致性 (Phase 2 决策) ────────────────────


def test_base_metadata_naming_convention_set(base_env: pytest.MonkeyPatch) -> None:
    """Base.metadata 必须挂 NAMING_CONVENTION (alembic autogenerate 风格统一)"""
    from app.core.database import Base

    nc = Base.metadata.naming_convention
    assert nc.get("ix") == "idx_%(column_0_label)s"
    assert nc.get("uq") == "uq_%(table_name)s_%(column_0_name)s"
    assert nc.get("fk") == "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
    assert nc.get("ck") == "ck_%(table_name)s_%(constraint_name)s"
    assert nc.get("pk") == "pk_%(table_name)s"
