"""
Phase 2.5c — Batch 5a smoke test (group + course 子表 ~17 张, 行号 626-936)。

覆盖:
  - group_scheme_sessions / group_instances / group_session_records /
    group_session_attendance / group_session_blocks (group 域 5)
  - course_chapters / course_enrollments / course_lesson_blocks /
    course_template_tags / course_content_blocks (course 域 5)
  - enrollment_block_responses (polymorphic — HIGH)
  - course_instances / course_feedback_forms / course_feedback_responses /
    course_homework_defs / course_homework_submissions /
    course_interaction_responses (course 域 6)
"""

from __future__ import annotations

# ─── tablenames ──────────────────────────────────────────────


def test_batch5a_tablenames() -> None:
    from app.db.models.course_chapters import CourseChapter
    from app.db.models.course_content_blocks import CourseContentBlock
    from app.db.models.course_enrollments import CourseEnrollment
    from app.db.models.course_feedback_forms import CourseFeedbackForm
    from app.db.models.course_feedback_responses import CourseFeedbackResponse
    from app.db.models.course_homework_defs import CourseHomeworkDef
    from app.db.models.course_homework_submissions import CourseHomeworkSubmission
    from app.db.models.course_instances import CourseInstance
    from app.db.models.course_interaction_responses import CourseInteractionResponse
    from app.db.models.course_lesson_blocks import CourseLessonBlock
    from app.db.models.course_template_tags import CourseTemplateTag
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse
    from app.db.models.group_instances import GroupInstance
    from app.db.models.group_scheme_sessions import GroupSchemeSession
    from app.db.models.group_session_attendance import GroupSessionAttendance
    from app.db.models.group_session_blocks import GroupSessionBlock
    from app.db.models.group_session_records import GroupSessionRecord

    assert CourseChapter.__tablename__ == "course_chapters"
    assert CourseContentBlock.__tablename__ == "course_content_blocks"
    assert CourseEnrollment.__tablename__ == "course_enrollments"
    assert CourseFeedbackForm.__tablename__ == "course_feedback_forms"
    assert CourseFeedbackResponse.__tablename__ == "course_feedback_responses"
    assert CourseHomeworkDef.__tablename__ == "course_homework_defs"
    assert CourseHomeworkSubmission.__tablename__ == "course_homework_submissions"
    assert CourseInstance.__tablename__ == "course_instances"
    assert CourseInteractionResponse.__tablename__ == "course_interaction_responses"
    assert CourseLessonBlock.__tablename__ == "course_lesson_blocks"
    assert CourseTemplateTag.__tablename__ == "course_template_tags"
    assert EnrollmentBlockResponse.__tablename__ == "enrollment_block_responses"
    assert GroupInstance.__tablename__ == "group_instances"
    assert GroupSchemeSession.__tablename__ == "group_scheme_sessions"
    assert GroupSessionAttendance.__tablename__ == "group_session_attendance"
    assert GroupSessionBlock.__tablename__ == "group_session_blocks"
    assert GroupSessionRecord.__tablename__ == "group_session_records"


# ─── group_scheme_sessions ──────────────────────────────────


def test_group_scheme_session_columns_match_drizzle() -> None:
    from app.db.models.group_scheme_sessions import GroupSchemeSession

    cols = {c.name for c in GroupSchemeSession.__table__.columns}
    assert {
        "id",
        "scheme_id",
        "title",
        "goal",
        "phases",
        "materials",
        "duration",
        "homework",
        "assessment_notes",
        "related_goals",
        "session_theory",
        "session_evaluation",
        "sort_order",
        "related_assessments",
    } <= cols


def test_group_scheme_session_scheme_cascade() -> None:
    from app.db.models.group_scheme_sessions import GroupSchemeSession

    fk = next(iter(GroupSchemeSession.__table__.c.scheme_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_group_scheme_session_no_timestamps() -> None:
    """无独立时间戳 — 与 scheme 一起更新"""
    from app.db.models.group_scheme_sessions import GroupSchemeSession

    cols = {c.name for c in GroupSchemeSession.__table__.columns}
    assert "created_at" not in cols
    assert "updated_at" not in cols


# ─── group_instances ───────────────────────────────────────


def test_group_instance_columns_match_drizzle() -> None:
    from app.db.models.group_instances import GroupInstance

    cols = {c.name for c in GroupInstance.__table__.columns}
    assert {
        "id",
        "org_id",
        "scheme_id",
        "title",
        "description",
        "category",
        "leader_id",
        "schedule",
        "duration",
        "start_date",
        "location",
        "status",
        "capacity",
        "recruitment_assessments",
        "overall_assessments",
        "screening_notes",
        "assessment_config",
        "created_by",
    } <= cols


def test_group_instance_status_default_draft() -> None:
    from app.db.models.group_instances import GroupInstance

    s = GroupInstance.__table__.c.status
    assert "draft" in str(s.server_default.arg)


# ─── group_session_records ─────────────────────────────────


def test_group_session_record_columns_match_drizzle() -> None:
    from app.db.models.group_session_records import GroupSessionRecord

    cols = {c.name for c in GroupSessionRecord.__table__.columns}
    assert {
        "id",
        "instance_id",
        "scheme_session_id",
        "session_number",
        "title",
        "date",
        "status",
        "notes",
    } <= cols


def test_group_session_record_scheme_session_set_null() -> None:
    """scheme_session 删除 → 字段置 NULL (记录保留)"""
    from app.db.models.group_session_records import GroupSessionRecord

    fk = next(iter(GroupSessionRecord.__table__.c.scheme_session_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


# ─── group_session_attendance ──────────────────────────────


def test_group_session_attendance_columns_match_drizzle() -> None:
    from app.db.models.group_session_attendance import GroupSessionAttendance

    cols = {c.name for c in GroupSessionAttendance.__table__.columns}
    assert {"id", "session_record_id", "enrollment_id", "status", "note"} <= cols


def test_group_session_attendance_unique() -> None:
    from app.db.models.group_session_attendance import GroupSessionAttendance

    names = {idx.name for idx in GroupSessionAttendance.__table__.indexes}
    assert "uq_group_attendance_session_enrollment" in names


# ─── group_session_blocks ──────────────────────────────────


def test_group_session_block_columns_match_drizzle() -> None:
    from app.db.models.group_session_blocks import GroupSessionBlock

    cols = {c.name for c in GroupSessionBlock.__table__.columns}
    assert {
        "id",
        "scheme_session_id",
        "block_type",
        "visibility",
        "sort_order",
        "payload",
        "created_by",
    } <= cols


def test_group_session_block_visibility_default_both() -> None:
    """团辅场景多双方共用, 默认 'both'"""
    from app.db.models.group_session_blocks import GroupSessionBlock

    v = GroupSessionBlock.__table__.c.visibility
    assert "both" in str(v.server_default.arg)


# ─── course_chapters ───────────────────────────────────────


def test_course_chapter_columns_match_drizzle() -> None:
    from app.db.models.course_chapters import CourseChapter

    cols = {c.name for c in CourseChapter.__table__.columns}
    assert {
        "id",
        "course_id",
        "title",
        "content",
        "video_url",
        "duration",
        "sort_order",
        "related_assessment_id",
        "session_goal",
        "core_concepts",
        "interaction_suggestions",
        "homework_suggestion",
    } <= cols


def test_course_chapter_no_timestamps() -> None:
    from app.db.models.course_chapters import CourseChapter

    cols = {c.name for c in CourseChapter.__table__.columns}
    assert "created_at" not in cols
    assert "updated_at" not in cols


# ─── course_enrollments ────────────────────────────────────


def test_course_enrollment_columns_match_drizzle() -> None:
    from app.db.models.course_enrollments import CourseEnrollment

    cols = {c.name for c in CourseEnrollment.__table__.columns}
    assert {
        "id",
        "course_id",
        "instance_id",
        "user_id",
        "care_episode_id",
        "assigned_by",
        "enrollment_source",
        "approval_status",
        "approved_by",
        "progress",
        "status",
        "enrolled_at",
        "completed_at",
    } <= cols


def test_course_enrollment_unique_course_user() -> None:
    from app.db.models.course_enrollments import CourseEnrollment

    names = {idx.name for idx in CourseEnrollment.__table__.indexes}
    assert "uq_course_enrollments_course_user" in names


# ─── course_lesson_blocks ──────────────────────────────────


def test_course_lesson_block_columns_match_drizzle() -> None:
    from app.db.models.course_lesson_blocks import CourseLessonBlock

    cols = {c.name for c in CourseLessonBlock.__table__.columns}
    assert {
        "id",
        "chapter_id",
        "block_type",
        "content",
        "sort_order",
        "ai_generated",
        "last_ai_instruction",
    } <= cols


# ─── course_template_tags ──────────────────────────────────


def test_course_template_tag_columns_match_drizzle() -> None:
    from app.db.models.course_template_tags import CourseTemplateTag

    cols = {c.name for c in CourseTemplateTag.__table__.columns}
    assert {"id", "org_id", "name", "color"} <= cols


# ─── course_content_blocks ─────────────────────────────────


def test_course_content_block_columns_match_drizzle() -> None:
    from app.db.models.course_content_blocks import CourseContentBlock

    cols = {c.name for c in CourseContentBlock.__table__.columns}
    assert {
        "id",
        "chapter_id",
        "block_type",
        "visibility",
        "sort_order",
        "payload",
        "created_by",
    } <= cols


def test_course_content_block_visibility_default_participant() -> None:
    """学员视角默认 'participant'"""
    from app.db.models.course_content_blocks import CourseContentBlock

    v = CourseContentBlock.__table__.c.visibility
    assert "participant" in str(v.server_default.arg)


# ─── enrollment_block_responses (HIGH polymorphic) ─────────


def test_enrollment_block_response_columns_match_drizzle() -> None:
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    cols = {c.name for c in EnrollmentBlockResponse.__table__.columns}
    assert {
        "id",
        "enrollment_id",
        "enrollment_type",
        "block_id",
        "block_type",
        "response",
        "completed_at",
        "safety_flags",
        "reviewed_by_counselor",
        "reviewed_at",
    } <= cols


def test_enrollment_block_response_polymorphic_no_fk_enrollment() -> None:
    """polymorphic — enrollment_id 不加 FK (跨 course/group enrollments)"""
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    assert len(EnrollmentBlockResponse.__table__.c.enrollment_id.foreign_keys) == 0


def test_enrollment_block_response_polymorphic_no_fk_block() -> None:
    """polymorphic — block_id 不加 FK"""
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    assert len(EnrollmentBlockResponse.__table__.c.block_id.foreign_keys) == 0


def test_enrollment_block_response_three_indexes() -> None:
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    names = {idx.name for idx in EnrollmentBlockResponse.__table__.indexes}
    assert "uq_enrollment_block_response" in names
    assert "idx_enrollment_block_responses_enrollment" in names
    assert "idx_enrollment_block_responses_safety" in names


def test_enrollment_block_response_safety_flags_default_empty() -> None:
    """safety_flags notNull, default 空数组"""
    from app.db.models.enrollment_block_responses import EnrollmentBlockResponse

    sf = EnrollmentBlockResponse.__table__.c.safety_flags
    assert sf.nullable is False
    assert "[]" in str(sf.server_default.arg)


# ─── course_instances ──────────────────────────────────────


def test_course_instance_columns_match_drizzle() -> None:
    from app.db.models.course_instances import CourseInstance

    cols = {c.name for c in CourseInstance.__table__.columns}
    assert {
        "id",
        "org_id",
        "course_id",
        "title",
        "description",
        "publish_mode",
        "status",
        "capacity",
        "target_group_label",
        "responsible_id",
        "assessment_config",
        "location",
        "start_date",
        "schedule",
        "created_by",
    } <= cols


def test_course_instance_publish_mode_default_assign() -> None:
    from app.db.models.course_instances import CourseInstance

    pm = CourseInstance.__table__.c.publish_mode
    assert "assign" in str(pm.server_default.arg)


def test_course_instance_org_cascade() -> None:
    from app.db.models.course_instances import CourseInstance

    fk = next(iter(CourseInstance.__table__.c.org_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


# ─── course_feedback_forms ─────────────────────────────────


def test_course_feedback_form_columns_match_drizzle() -> None:
    from app.db.models.course_feedback_forms import CourseFeedbackForm

    cols = {c.name for c in CourseFeedbackForm.__table__.columns}
    assert {"id", "instance_id", "chapter_id", "title", "questions", "is_active"} <= cols


# ─── course_feedback_responses ─────────────────────────────


def test_course_feedback_response_columns_match_drizzle() -> None:
    from app.db.models.course_feedback_responses import CourseFeedbackResponse

    cols = {c.name for c in CourseFeedbackResponse.__table__.columns}
    assert {"id", "form_id", "enrollment_id", "answers", "submitted_at"} <= cols


def test_course_feedback_response_unique() -> None:
    from app.db.models.course_feedback_responses import CourseFeedbackResponse

    names = {idx.name for idx in CourseFeedbackResponse.__table__.indexes}
    assert "uq_feedback_response_form_enrollment" in names


# ─── course_homework_defs ──────────────────────────────────


def test_course_homework_def_columns_match_drizzle() -> None:
    from app.db.models.course_homework_defs import CourseHomeworkDef

    cols = {c.name for c in CourseHomeworkDef.__table__.columns}
    assert {
        "id",
        "instance_id",
        "chapter_id",
        "title",
        "description",
        "question_type",
        "options",
        "is_required",
        "sort_order",
    } <= cols


def test_course_homework_def_question_type_default_text() -> None:
    from app.db.models.course_homework_defs import CourseHomeworkDef

    qt = CourseHomeworkDef.__table__.c.question_type
    assert "text" in str(qt.server_default.arg)


# ─── course_homework_submissions ──────────────────────────


def test_course_homework_submission_columns_match_drizzle() -> None:
    from app.db.models.course_homework_submissions import CourseHomeworkSubmission

    cols = {c.name for c in CourseHomeworkSubmission.__table__.columns}
    assert {
        "id",
        "homework_def_id",
        "enrollment_id",
        "content",
        "selected_options",
        "status",
        "review_comment",
        "reviewed_by",
        "reviewed_at",
        "submitted_at",
        "updated_at",
    } <= cols


def test_course_homework_submission_unique() -> None:
    from app.db.models.course_homework_submissions import CourseHomeworkSubmission

    names = {idx.name for idx in CourseHomeworkSubmission.__table__.indexes}
    assert "uq_homework_submission_def_enrollment" in names


# ─── course_interaction_responses ─────────────────────────


def test_course_interaction_response_columns_match_drizzle() -> None:
    from app.db.models.course_interaction_responses import CourseInteractionResponse

    cols = {c.name for c in CourseInteractionResponse.__table__.columns}
    assert {
        "id",
        "block_id",
        "instance_id",
        "enrollment_id",
        "response_type",
        "response_data",
    } <= cols


# ─── re-export ─────────────────────────────────────────────


def test_batch5a_models_re_exported() -> None:
    from app.db.models import (
        CourseChapter,
        CourseContentBlock,
        CourseEnrollment,
        CourseFeedbackForm,
        CourseFeedbackResponse,
        CourseHomeworkDef,
        CourseHomeworkSubmission,
        CourseInstance,
        CourseInteractionResponse,
        CourseLessonBlock,
        CourseTemplateTag,
        EnrollmentBlockResponse,
        GroupInstance,
        GroupSchemeSession,
        GroupSessionAttendance,
        GroupSessionBlock,
        GroupSessionRecord,
    )

    for m in (
        CourseChapter,
        CourseContentBlock,
        CourseEnrollment,
        CourseFeedbackForm,
        CourseFeedbackResponse,
        CourseHomeworkDef,
        CourseHomeworkSubmission,
        CourseInstance,
        CourseInteractionResponse,
        CourseLessonBlock,
        CourseTemplateTag,
        EnrollmentBlockResponse,
        GroupInstance,
        GroupSchemeSession,
        GroupSessionAttendance,
        GroupSessionBlock,
        GroupSessionRecord,
    ):
        assert m is not None
