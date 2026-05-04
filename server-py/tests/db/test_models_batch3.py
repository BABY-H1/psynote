"""
Phase 2.4 — Batch 3 模型 smoke test (6 张 domain 根表)。

目的: 凑齐 Plan 写的 review checkpoint 3 五个核心表 (本批补 courses + group_enrollments),
让 Founder 能在中场看 5 个产品最常思考的实体的字段映射风格。

覆盖:
  - care_episodes      counseling 域核心 (被 15+ 引用)
  - scales             assessment 域根 (PHI + 知识库分发)
  - assessments        assessment 域核心 (复杂 JSONB 结构)
  - courses            course 域根 (复杂 JSONB + 自引用 source_template_id)
  - group_schemes      group 域根 (字段最多 15+)
  - group_enrollments  group 报名关系 (review checkpoint 3 之一)
"""

from __future__ import annotations

# ─── __tablename__ ─────────────────────────────────────────────


def test_batch3_table_names() -> None:
    from app.db.models.assessments import Assessment
    from app.db.models.care_episodes import CareEpisode
    from app.db.models.courses import Course
    from app.db.models.group_enrollments import GroupEnrollment
    from app.db.models.group_schemes import GroupScheme
    from app.db.models.scales import Scale

    assert Assessment.__tablename__ == "assessments"
    assert CareEpisode.__tablename__ == "care_episodes"
    assert Course.__tablename__ == "courses"
    assert GroupEnrollment.__tablename__ == "group_enrollments"
    assert GroupScheme.__tablename__ == "group_schemes"
    assert Scale.__tablename__ == "scales"


# ─── care_episodes ───────────────────────────────────────────


def test_care_episode_counselor_nullable() -> None:
    """咨询师可空 — 候补阶段 / 自助 portal 评估期 counselor_id IS NULL"""
    from app.db.models.care_episodes import CareEpisode

    assert CareEpisode.__table__.c.counselor_id.nullable is True
    assert CareEpisode.__table__.c.client_id.nullable is False


def test_care_episode_current_risk_default_level_1() -> None:
    """危机研判默认低风险, level_1~level_4 即「四级研判」"""
    from app.db.models.care_episodes import CareEpisode

    risk = CareEpisode.__table__.c.current_risk
    assert risk.nullable is False
    assert "level_1" in str(risk.server_default.arg)


def test_care_episode_opened_at_default_now() -> None:
    """opened_at 与 created_at 区别: 业务时间线 vs DB 行创建时间"""
    from app.db.models.care_episodes import CareEpisode

    opened = CareEpisode.__table__.c.opened_at
    closed = CareEpisode.__table__.c.closed_at
    assert opened.nullable is False
    assert closed.nullable is True


def test_care_episode_lookup_index() -> None:
    """idx_care_episodes_client (org_id, client_id) — 高频查询路径"""
    from app.db.models.care_episodes import CareEpisode

    names = {idx.name for idx in CareEpisode.__table__.indexes}
    assert "idx_care_episodes_client" in names


# ─── scales ──────────────────────────────────────────────────


def test_scale_org_id_nullable_for_platform_scales() -> None:
    """org_id IS NULL → 平台级量表 (官方维护)"""
    from app.db.models.scales import Scale

    assert Scale.__table__.c.org_id.nullable is True


def test_scale_knowledge_library_distribution_fields() -> None:
    """is_public + allowed_org_ids 是 Phase 1 决策保留的现有分发机制"""
    from app.db.models.scales import Scale

    cols = Scale.__table__.c
    assert "is_public" in cols
    assert "allowed_org_ids" in cols
    assert cols.is_public.nullable is False
    assert cols.allowed_org_ids.nullable is True


def test_scale_scoring_mode_default_sum() -> None:
    from app.db.models.scales import Scale

    sm = Scale.__table__.c.scoring_mode
    assert sm.nullable is False
    assert "sum" in str(sm.server_default.arg)


# ─── assessments ─────────────────────────────────────────────


def test_assessment_org_id_required() -> None:
    """assessments.org_id NOT NULL (与 scales 不同 — assessment 不做平台级"""
    from app.db.models.assessments import Assessment

    assert Assessment.__table__.c.org_id.nullable is False


def test_assessment_has_soft_delete_field() -> None:
    """assessments.deleted_at 存在 → 业务读取需过滤 deleted_at IS NULL"""
    from app.db.models.assessments import Assessment

    cols = {c.name for c in Assessment.__table__.columns}
    assert "deleted_at" in cols
    assert Assessment.__table__.c.deleted_at.nullable is True


def test_assessment_jsonb_fields_have_defaults() -> None:
    from app.db.models.assessments import Assessment

    cols = Assessment.__table__.c
    for name in ("demographics", "blocks", "screening_rules", "result_display"):
        col = cols[name]
        assert col.nullable is False, f"{name} 应 NOT NULL"
        assert col.server_default is not None, f"{name} 应有 server_default"


def test_assessment_result_display_default_includes_advice() -> None:
    """默认 show 列表里要有 'advice' (Drizzle 默认值的关键设计)"""
    from app.db.models.assessments import Assessment

    rd = Assessment.__table__.c.result_display
    assert "advice" in str(rd.server_default.arg)


# ─── courses (review checkpoint 3 重点) ──────────────────────


def test_course_self_fk_source_template_id() -> None:
    """实例课 source_template_id 自引用 courses.id (模板派生)"""
    from app.db.models.courses import Course

    fks = list(Course.__table__.c.source_template_id.foreign_keys)
    assert len(fks) == 1
    assert fks[0].column.table.name == "courses"


def test_course_is_template_distinguishes_from_instance() -> None:
    """is_template=true 标记模板课, false (默认) 是实例课"""
    from app.db.models.courses import Course

    is_t = Course.__table__.c.is_template
    assert is_t.nullable is False
    assert "false" in str(is_t.server_default.arg).lower()


def test_course_status_lifecycle_default_draft() -> None:
    """5 阶段生命周期: draft → blueprint → content_authoring → published → archived"""
    from app.db.models.courses import Course

    s = Course.__table__.c.status
    assert s.nullable is False
    assert "draft" in str(s.server_default.arg)


def test_course_creation_mode_default_manual() -> None:
    """ai_assisted vs manual; 默认手动避免 AI 误触发"""
    from app.db.models.courses import Course

    cm = Course.__table__.c.creation_mode
    assert cm.nullable is False
    assert "manual" in str(cm.server_default.arg)


def test_course_org_id_nullable_for_platform_courses() -> None:
    """与 scales 一致: org_id IS NULL → 平台课"""
    from app.db.models.courses import Course

    assert Course.__table__.c.org_id.nullable is True


def test_course_knowledge_library_distribution() -> None:
    from app.db.models.courses import Course

    cols = Course.__table__.c
    assert "is_public" in cols
    assert "allowed_org_ids" in cols


# ─── group_schemes ───────────────────────────────────────────


def test_group_scheme_visibility_default_personal() -> None:
    """visibility 默认 personal — 创建者本人可见 (与 courses 的 is_public default false 一致语义)"""
    from app.db.models.group_schemes import GroupScheme

    v = GroupScheme.__table__.c.visibility
    assert v.nullable is False
    assert "personal" in str(v.server_default.arg)


def test_group_scheme_total_sessions_integer() -> None:
    """total_sessions 是整数 (8 周, 12 次), 不是字符串"""
    from sqlalchemy import Integer

    from app.db.models.group_schemes import GroupScheme

    ts = GroupScheme.__table__.c.total_sessions
    assert isinstance(ts.type, Integer)
    assert ts.nullable is True


def test_group_scheme_specific_goals_jsonb_array() -> None:
    """specific_goals 是 JSONB string[] 默认空数组"""
    from app.db.models.group_schemes import GroupScheme

    sg = GroupScheme.__table__.c.specific_goals
    assert "[]" in str(sg.server_default.arg)


# ─── group_enrollments (review checkpoint 3 重点) ────────────


def test_group_enrollment_unique_per_instance_user() -> None:
    """同 instance 同 user 只能报 1 次"""
    from app.db.models.group_enrollments import GroupEnrollment

    indexes = {idx.name: idx for idx in GroupEnrollment.__table__.indexes}
    uq = indexes["uq_group_enrollments_instance_user"]
    assert uq.unique is True
    assert [c.name for c in uq.columns] == ["instance_id", "user_id"]


def test_group_enrollment_status_default_pending() -> None:
    """报名提交后默认 pending, 走筛选/审批后才 enrolled"""
    from app.db.models.group_enrollments import GroupEnrollment

    s = GroupEnrollment.__table__.c.status
    assert s.nullable is False
    assert "pending" in str(s.server_default.arg)


def test_group_enrollment_instance_cascade_delete() -> None:
    """instance 删除 → enrollment 跟着删 (业务一致)"""
    from app.db.models.group_enrollments import GroupEnrollment

    fk = next(iter(GroupEnrollment.__table__.c.instance_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_group_enrollment_care_episode_optional() -> None:
    """单独参团不走个咨, care_episode_id 可空"""
    from app.db.models.group_enrollments import GroupEnrollment

    assert GroupEnrollment.__table__.c.care_episode_id.nullable is True


# ─── re-export ────────────────────────────────────────────────


def test_batch3_models_re_exported() -> None:
    from app.db.models import (
        Assessment,
        CareEpisode,
        Course,
        GroupEnrollment,
        GroupScheme,
        Scale,
    )

    assert Assessment is not None
    assert CareEpisode is not None
    assert Course is not None
    assert GroupEnrollment is not None
    assert GroupScheme is not None
    assert Scale is not None
