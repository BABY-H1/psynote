"""
Phase 2.5b — Batch 4b smoke test (counseling + followup + ai 域 14 张表)。

覆盖 (按 Drizzle 行号排序):
  - care_timeline (294)              counseling
  - counselor_availability (308)     counseling
  - appointments (323)               counseling
  - reminder_settings (345)          counseling
  - note_templates (358)             counseling (知识库)
  - session_notes (377)              counseling (HIGH — PHI 核心)
  - note_attachments (408)           counseling
  - treatment_plans (421)            counseling
  - treatment_goal_library (440)     counseling (知识库)
  - client_documents (458)           counseling
  - referrals (487)                  followup (HIGH — Phase 9δ 状态机)
  - follow_up_plans (534)            followup
  - follow_up_reviews (550)          followup
  - ai_conversations (566)           ai
"""

from __future__ import annotations

# ─── tablenames ──────────────────────────────────────────────


def test_batch4b_tablenames() -> None:
    from app.db.models.ai_conversations import AIConversation
    from app.db.models.appointments import Appointment
    from app.db.models.care_timeline import CareTimeline
    from app.db.models.client_documents import ClientDocument
    from app.db.models.counselor_availability import CounselorAvailability
    from app.db.models.follow_up_plans import FollowUpPlan
    from app.db.models.follow_up_reviews import FollowUpReview
    from app.db.models.note_attachments import NoteAttachment
    from app.db.models.note_templates import NoteTemplate
    from app.db.models.referrals import Referral
    from app.db.models.reminder_settings import ReminderSettings
    from app.db.models.session_notes import SessionNote
    from app.db.models.treatment_goal_library import TreatmentGoalLibrary
    from app.db.models.treatment_plans import TreatmentPlan

    assert AIConversation.__tablename__ == "ai_conversations"
    assert Appointment.__tablename__ == "appointments"
    assert CareTimeline.__tablename__ == "care_timeline"
    assert ClientDocument.__tablename__ == "client_documents"
    assert CounselorAvailability.__tablename__ == "counselor_availability"
    assert FollowUpPlan.__tablename__ == "follow_up_plans"
    assert FollowUpReview.__tablename__ == "follow_up_reviews"
    assert NoteAttachment.__tablename__ == "note_attachments"
    assert NoteTemplate.__tablename__ == "note_templates"
    assert Referral.__tablename__ == "referrals"
    assert ReminderSettings.__tablename__ == "reminder_settings"
    assert SessionNote.__tablename__ == "session_notes"
    assert TreatmentGoalLibrary.__tablename__ == "treatment_goal_library"
    assert TreatmentPlan.__tablename__ == "treatment_plans"


# ─── care_timeline ──────────────────────────────────────────


def test_care_timeline_columns_match_drizzle() -> None:
    from app.db.models.care_timeline import CareTimeline

    cols = {c.name for c in CareTimeline.__table__.columns}
    assert {
        "id",
        "care_episode_id",
        "event_type",
        "ref_id",
        "title",
        "summary",
        "metadata",
        "created_by",
        "created_at",
    } <= cols


def test_care_timeline_episode_cascade() -> None:
    from app.db.models.care_timeline import CareTimeline

    fk = next(iter(CareTimeline.__table__.c.care_episode_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_care_timeline_ref_id_no_fk() -> None:
    """ref_id 软关联 (跨多种事件源), 不加 FK"""
    from app.db.models.care_timeline import CareTimeline

    assert len(CareTimeline.__table__.c.ref_id.foreign_keys) == 0


# ─── counselor_availability ─────────────────────────────────


def test_counselor_availability_columns_match_drizzle() -> None:
    from app.db.models.counselor_availability import CounselorAvailability

    cols = {c.name for c in CounselorAvailability.__table__.columns}
    assert {
        "id",
        "org_id",
        "counselor_id",
        "day_of_week",
        "start_time",
        "end_time",
        "session_type",
        "is_active",
    } <= cols


def test_counselor_availability_unique_slot_index() -> None:
    from app.db.models.counselor_availability import CounselorAvailability

    names = {idx.name for idx in CounselorAvailability.__table__.indexes}
    assert "uq_availability_slot" in names


# ─── appointments ──────────────────────────────────────────


def test_appointment_columns_match_drizzle() -> None:
    from app.db.models.appointments import Appointment

    cols = {c.name for c in Appointment.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "client_id",
        "counselor_id",
        "start_time",
        "end_time",
        "status",
        "type",
        "source",
        "notes",
        "reminder_sent_24h",
        "reminder_sent_1h",
        "client_confirmed_at",
        "confirm_token",
    } <= cols


def test_appointment_status_default_pending() -> None:
    from app.db.models.appointments import Appointment

    s = Appointment.__table__.c.status
    assert "pending" in str(s.server_default.arg)


# ─── reminder_settings ─────────────────────────────────────


def test_reminder_settings_columns_match_drizzle() -> None:
    from app.db.models.reminder_settings import ReminderSettings

    cols = {c.name for c in ReminderSettings.__table__.columns}
    assert {
        "id",
        "org_id",
        "enabled",
        "channels",
        "remind_before",
        "email_config",
        "sms_config",
        "message_template",
    } <= cols


def test_reminder_settings_org_id_unique() -> None:
    """1 个 org 只 1 行设置"""
    from app.db.models.reminder_settings import ReminderSettings

    assert ReminderSettings.__table__.c.org_id.unique is True


# ─── note_templates ────────────────────────────────────────


def test_note_template_columns_match_drizzle() -> None:
    from app.db.models.note_templates import NoteTemplate

    cols = {c.name for c in NoteTemplate.__table__.columns}
    assert {
        "id",
        "org_id",
        "title",
        "format",
        "field_definitions",
        "is_default",
        "visibility",
        "allowed_org_ids",
        "created_by",
    } <= cols


def test_note_template_visibility_default_personal() -> None:
    from app.db.models.note_templates import NoteTemplate

    v = NoteTemplate.__table__.c.visibility
    assert "personal" in str(v.server_default.arg)


# ─── session_notes (HIGH complexity, PHI 核心) ────────────


def test_session_note_columns_match_drizzle() -> None:
    from app.db.models.session_notes import SessionNote

    cols = {c.name for c in SessionNote.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "appointment_id",
        "client_id",
        "counselor_id",
        "note_format",
        "template_id",
        "session_date",
        "duration",
        "session_type",
        "subjective",
        "objective",
        "assessment",
        "plan",
        "fields",
        "summary",
        "tags",
        "status",
        "supervisor_annotation",
        "submitted_for_review_at",
    } <= cols


def test_session_note_no_allowed_org_ids() -> None:
    """Drizzle 注释明确: session_notes 是个人临床记录, 永不跨机构共享"""
    from app.db.models.session_notes import SessionNote

    cols = {c.name for c in SessionNote.__table__.columns}
    assert "allowed_org_ids" not in cols


def test_session_note_no_deleted_at() -> None:
    """临床记录不允许软删除 (合规要求)"""
    from app.db.models.session_notes import SessionNote

    cols = {c.name for c in SessionNote.__table__.columns}
    assert "deleted_at" not in cols


def test_session_note_format_default_soap() -> None:
    from app.db.models.session_notes import SessionNote

    f = SessionNote.__table__.c.note_format
    assert "soap" in str(f.server_default.arg)


def test_session_note_status_default_draft() -> None:
    """督导审签流: draft → finalized → submitted_for_review → reviewed"""
    from app.db.models.session_notes import SessionNote

    s = SessionNote.__table__.c.status
    assert "draft" in str(s.server_default.arg)


def test_session_note_session_date_required() -> None:
    """session_date 必填 — 没日期的会谈记录无意义"""
    from app.db.models.session_notes import SessionNote

    assert SessionNote.__table__.c.session_date.nullable is False


# ─── note_attachments ──────────────────────────────────────


def test_note_attachment_columns_match_drizzle() -> None:
    from app.db.models.note_attachments import NoteAttachment

    cols = {c.name for c in NoteAttachment.__table__.columns}
    assert {
        "id",
        "note_id",
        "org_id",
        "file_name",
        "file_type",
        "file_path",
        "file_size",
        "transcription",
        "uploaded_by",
    } <= cols


def test_note_attachment_note_cascade() -> None:
    from app.db.models.note_attachments import NoteAttachment

    fk = next(iter(NoteAttachment.__table__.c.note_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


# ─── treatment_plans ───────────────────────────────────────


def test_treatment_plan_columns_match_drizzle() -> None:
    from app.db.models.treatment_plans import TreatmentPlan

    cols = {c.name for c in TreatmentPlan.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "counselor_id",
        "status",
        "title",
        "approach",
        "goals",
        "interventions",
        "session_plan",
        "progress_notes",
        "review_date",
    } <= cols


def test_treatment_plan_episode_status_index() -> None:
    from app.db.models.treatment_plans import TreatmentPlan

    names = {idx.name for idx in TreatmentPlan.__table__.indexes}
    assert "idx_treatment_plans_episode" in names


# ─── treatment_goal_library ─────────────────────────────────


def test_treatment_goal_library_columns_match_drizzle() -> None:
    from app.db.models.treatment_goal_library import TreatmentGoalLibrary

    cols = {c.name for c in TreatmentGoalLibrary.__table__.columns}
    assert {
        "id",
        "org_id",
        "title",
        "description",
        "problem_area",
        "category",
        "objectives_template",
        "intervention_suggestions",
        "visibility",
        "allowed_org_ids",
        "created_by",
    } <= cols


# ─── client_documents ──────────────────────────────────────


def test_client_document_columns_match_drizzle() -> None:
    from app.db.models.client_documents import ClientDocument

    cols = {c.name for c in ClientDocument.__table__.columns}
    assert {
        "id",
        "org_id",
        "client_id",
        "care_episode_id",
        "template_id",
        "title",
        "content",
        "doc_type",
        "consent_type",
        "recipient_type",
        "recipient_name",
        "status",
        "signed_at",
        "signature_data",
        "file_path",
        "created_by",
    } <= cols


def test_client_document_recipient_type_default_client() -> None:
    """Phase 13 危机引入: guardian 模式不在 portal 给来访者展示"""
    from app.db.models.client_documents import ClientDocument

    rt = ClientDocument.__table__.c.recipient_type
    assert "client" in str(rt.server_default.arg)


def test_client_document_template_id_no_fk() -> None:
    """Drizzle 注释: FK added after consentTemplates table is created — 软关联"""
    from app.db.models.client_documents import ClientDocument

    assert len(ClientDocument.__table__.c.template_id.foreign_keys) == 0


# ─── referrals (HIGH complexity, Phase 9δ 状态机 + 数据包) ──


def test_referral_columns_match_drizzle() -> None:
    from app.db.models.referrals import Referral

    cols = {c.name for c in Referral.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "client_id",
        "referred_by",
        "reason",
        "risk_summary",
        "target_type",
        "target_name",
        "target_contact",
        "status",
        "follow_up_plan",
        "follow_up_notes",
        "mode",
        "to_counselor_id",
        "to_org_id",
        "data_package_spec",
        "consented_at",
        "accepted_at",
        "rejected_at",
        "rejection_reason",
        "download_token",
        "download_expires_at",
    } <= cols


def test_referral_status_default_pending() -> None:
    from app.db.models.referrals import Referral

    s = Referral.__table__.c.status
    assert "pending" in str(s.server_default.arg)


def test_referral_mode_default_external() -> None:
    """Phase 9δ: 默认 'external' (PDF + 一次性下载链), 与现有兼容"""
    from app.db.models.referrals import Referral

    m = Referral.__table__.c.mode
    assert "external" in str(m.server_default.arg)


def test_referral_data_package_spec_required() -> None:
    """Phase 9δ: data_package_spec notNull, default 空对象"""
    from app.db.models.referrals import Referral

    dp = Referral.__table__.c.data_package_spec
    assert dp.nullable is False
    assert "{}" in str(dp.server_default.arg)


def test_referral_three_indexes() -> None:
    """按 episode / 接收咨询师 / 接收机构 各一"""
    from app.db.models.referrals import Referral

    names = {idx.name for idx in Referral.__table__.indexes}
    assert "idx_referrals_episode" in names
    assert "idx_referrals_to_counselor" in names
    assert "idx_referrals_to_org" in names


def test_referral_consented_at_nullable() -> None:
    """状态机: pending 时 consented_at IS NULL"""
    from app.db.models.referrals import Referral

    assert Referral.__table__.c.consented_at.nullable is True


# ─── follow_up_plans ───────────────────────────────────────


def test_follow_up_plan_columns_match_drizzle() -> None:
    from app.db.models.follow_up_plans import FollowUpPlan

    cols = {c.name for c in FollowUpPlan.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "counselor_id",
        "plan_type",
        "assessment_id",
        "frequency",
        "next_due",
        "status",
        "notes",
    } <= cols


def test_follow_up_plan_due_index() -> None:
    """按 next_due 扫到期, cron 友好"""
    from app.db.models.follow_up_plans import FollowUpPlan

    names = {idx.name for idx in FollowUpPlan.__table__.indexes}
    assert "idx_follow_up_plans_due" in names


# ─── follow_up_reviews ─────────────────────────────────────


def test_follow_up_review_columns_match_drizzle() -> None:
    from app.db.models.follow_up_reviews import FollowUpReview

    cols = {c.name for c in FollowUpReview.__table__.columns}
    assert {
        "id",
        "plan_id",
        "care_episode_id",
        "counselor_id",
        "review_date",
        "result_id",
        "risk_before",
        "risk_after",
        "clinical_note",
        "decision",
    } <= cols


# ─── ai_conversations ──────────────────────────────────────


def test_ai_conversation_columns_match_drizzle() -> None:
    from app.db.models.ai_conversations import AIConversation

    cols = {c.name for c in AIConversation.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "counselor_id",
        "mode",
        "title",
        "messages",
        "summary",
        "session_note_id",
    } <= cols


def test_ai_conversation_episode_cascade() -> None:
    """PHI 关联, episode 删除 → 对话随删"""
    from app.db.models.ai_conversations import AIConversation

    fk = next(iter(AIConversation.__table__.c.care_episode_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_ai_conversation_session_note_set_null() -> None:
    """session_note 删除 → 对话保留, 字段置 NULL"""
    from app.db.models.ai_conversations import AIConversation

    fk = next(iter(AIConversation.__table__.c.session_note_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


def test_ai_conversation_two_indexes() -> None:
    from app.db.models.ai_conversations import AIConversation

    names = {idx.name for idx in AIConversation.__table__.indexes}
    assert "idx_ai_conversations_episode" in names
    assert "idx_ai_conversations_session_note" in names


# ─── re-export ─────────────────────────────────────────────


def test_batch4b_models_re_exported() -> None:
    from app.db.models import (
        AIConversation,
        Appointment,
        CareTimeline,
        ClientDocument,
        CounselorAvailability,
        FollowUpPlan,
        FollowUpReview,
        NoteAttachment,
        NoteTemplate,
        Referral,
        ReminderSettings,
        SessionNote,
        TreatmentGoalLibrary,
        TreatmentPlan,
    )

    for m in (
        AIConversation,
        Appointment,
        CareTimeline,
        ClientDocument,
        CounselorAvailability,
        FollowUpPlan,
        FollowUpReview,
        NoteAttachment,
        NoteTemplate,
        Referral,
        ReminderSettings,
        SessionNote,
        TreatmentGoalLibrary,
        TreatmentPlan,
    ):
        assert m is not None
