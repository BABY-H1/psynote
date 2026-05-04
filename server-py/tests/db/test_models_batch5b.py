"""
Phase 2.5d — Batch 5b smoke test (audit + notification + member + consent +
eap + school + workflow + ai_logs + crisis + system 共 23 张, 行号 950-1494)。

覆盖:
  - compliance_reviews (950)         audit
  - notifications (968)              notification (polymorphic refType/refId)
  - audit_logs (983)                 audit (含 inet)
  - phi_access_logs (995)            audit (含 inet)
  - user_role_audit (1022)           audit (Migration 026)
  - consent_templates (1040)         counseling 知识库
  - consent_records (1058)           counseling (HIGH)
  - service_intakes (1080)           member (HIGH)
  - eap_partnerships (1128)          eap
  - eap_counselor_assignments (1147) eap
  - eap_employee_profiles (1163)     eap
  - eap_usage_events (1177)          eap
  - eap_crisis_alerts (1193)         eap
  - school_classes (1211)            school
  - school_student_profiles (1224)   school
  - workflow_rules (1257)            workflow (HIGH)
  - workflow_executions (1290)       workflow
  - candidate_pool (1315)            workflow (HIGH polymorphic)
  - ai_call_logs (1360)              ai
  - crisis_cases (1392)              crisis (HIGH)
  - class_parent_invite_tokens (1446) school (Phase 14)
  - client_relationships (1469)      member (Phase 14)
  - system_config (1491)             system
"""

from __future__ import annotations

# ─── tablenames ──────────────────────────────────────────────


def test_batch5b_tablenames() -> None:
    from app.db.models.ai_call_logs import AICallLog
    from app.db.models.audit_logs import AuditLog
    from app.db.models.candidate_pool import CandidatePool
    from app.db.models.class_parent_invite_tokens import ClassParentInviteToken
    from app.db.models.client_relationships import ClientRelationship
    from app.db.models.compliance_reviews import ComplianceReview
    from app.db.models.consent_records import ConsentRecord
    from app.db.models.consent_templates import ConsentTemplate
    from app.db.models.crisis_cases import CrisisCase
    from app.db.models.eap_counselor_assignments import EAPCounselorAssignment
    from app.db.models.eap_crisis_alerts import EAPCrisisAlert
    from app.db.models.eap_employee_profiles import EAPEmployeeProfile
    from app.db.models.eap_partnerships import EAPPartnership
    from app.db.models.eap_usage_events import EAPUsageEvent
    from app.db.models.notifications import Notification
    from app.db.models.phi_access_logs import PHIAccessLog
    from app.db.models.school_classes import SchoolClass
    from app.db.models.school_student_profiles import SchoolStudentProfile
    from app.db.models.service_intakes import ServiceIntake
    from app.db.models.system_config import SystemConfig
    from app.db.models.user_role_audit import UserRoleAudit
    from app.db.models.workflow_executions import WorkflowExecution
    from app.db.models.workflow_rules import WorkflowRule

    assert AICallLog.__tablename__ == "ai_call_logs"
    assert AuditLog.__tablename__ == "audit_logs"
    assert CandidatePool.__tablename__ == "candidate_pool"
    assert ClassParentInviteToken.__tablename__ == "class_parent_invite_tokens"
    assert ClientRelationship.__tablename__ == "client_relationships"
    assert ComplianceReview.__tablename__ == "compliance_reviews"
    assert ConsentRecord.__tablename__ == "consent_records"
    assert ConsentTemplate.__tablename__ == "consent_templates"
    assert CrisisCase.__tablename__ == "crisis_cases"
    assert EAPCounselorAssignment.__tablename__ == "eap_counselor_assignments"
    assert EAPCrisisAlert.__tablename__ == "eap_crisis_alerts"
    assert EAPEmployeeProfile.__tablename__ == "eap_employee_profiles"
    assert EAPPartnership.__tablename__ == "eap_partnerships"
    assert EAPUsageEvent.__tablename__ == "eap_usage_events"
    assert Notification.__tablename__ == "notifications"
    assert PHIAccessLog.__tablename__ == "phi_access_logs"
    assert SchoolClass.__tablename__ == "school_classes"
    assert SchoolStudentProfile.__tablename__ == "school_student_profiles"
    assert ServiceIntake.__tablename__ == "service_intakes"
    assert SystemConfig.__tablename__ == "system_config"
    assert UserRoleAudit.__tablename__ == "user_role_audit"
    assert WorkflowExecution.__tablename__ == "workflow_executions"
    assert WorkflowRule.__tablename__ == "workflow_rules"


# ─── compliance_reviews ─────────────────────────────────────


def test_compliance_review_columns_match_drizzle() -> None:
    from app.db.models.compliance_reviews import ComplianceReview

    cols = {c.name for c in ComplianceReview.__table__.columns}
    assert {
        "id",
        "org_id",
        "care_episode_id",
        "note_id",
        "counselor_id",
        "review_type",
        "score",
        "findings",
        "golden_thread_score",
        "quality_indicators",
        "reviewed_at",
        "reviewed_by",
    } <= cols


def test_compliance_review_reviewed_by_default_ai() -> None:
    """默认 'ai' (AI 自动审查为主)"""
    from app.db.models.compliance_reviews import ComplianceReview

    rb = ComplianceReview.__table__.c.reviewed_by
    assert "ai" in str(rb.server_default.arg)


# ─── notifications (polymorphic refType/refId) ─────────────


def test_notification_columns_match_drizzle() -> None:
    from app.db.models.notifications import Notification

    cols = {c.name for c in Notification.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "type",
        "title",
        "body",
        "ref_type",
        "ref_id",
        "is_read",
    } <= cols


def test_notification_ref_id_polymorphic_no_fk() -> None:
    """ref_id 跨多种表多态, 不加 FK"""
    from app.db.models.notifications import Notification

    assert len(Notification.__table__.c.ref_id.foreign_keys) == 0


def test_notification_user_index() -> None:
    from app.db.models.notifications import Notification

    names = {idx.name for idx in Notification.__table__.indexes}
    assert "idx_notifications_user" in names


# ─── audit_logs (含 inet 类型) ────────────────────────────


def test_audit_log_columns_match_drizzle() -> None:
    from app.db.models.audit_logs import AuditLog

    cols = {c.name for c in AuditLog.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "action",
        "resource",
        "resource_id",
        "changes",
        "ip_address",
    } <= cols


def test_audit_log_ip_address_inet_type() -> None:
    """ip_address 用 PG 原生 inet 类型"""
    from sqlalchemy.dialects.postgresql import INET

    from app.db.models.audit_logs import AuditLog

    assert isinstance(AuditLog.__table__.c.ip_address.type, INET)


# ─── phi_access_logs (含 inet, Migration 026) ─────────────


def test_phi_access_log_columns_match_drizzle() -> None:
    from app.db.models.phi_access_logs import PHIAccessLog

    cols = {c.name for c in PHIAccessLog.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "client_id",
        "resource",
        "resource_id",
        "action",
        "reason",
        "data_class",
        "actor_role_snapshot",
        "ip_address",
        "user_agent",
    } <= cols


def test_phi_access_log_inet() -> None:
    from sqlalchemy.dialects.postgresql import INET

    from app.db.models.phi_access_logs import PHIAccessLog

    assert isinstance(PHIAccessLog.__table__.c.ip_address.type, INET)


# ─── user_role_audit ───────────────────────────────────────


def test_user_role_audit_columns_match_drizzle() -> None:
    from app.db.models.user_role_audit import UserRoleAudit

    cols = {c.name for c in UserRoleAudit.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "action",
        "role_before",
        "role_after",
        "access_profile_before",
        "access_profile_after",
        "actor_id",
        "actor_role_snapshot",
        "reason",
    } <= cols


def test_user_role_audit_two_indexes() -> None:
    from app.db.models.user_role_audit import UserRoleAudit

    names = {idx.name for idx in UserRoleAudit.__table__.indexes}
    assert "idx_user_role_audit_org_user" in names
    assert "idx_user_role_audit_actor" in names


# ─── consent_templates ────────────────────────────────────


def test_consent_template_columns_match_drizzle() -> None:
    from app.db.models.consent_templates import ConsentTemplate

    cols = {c.name for c in ConsentTemplate.__table__.columns}
    assert {
        "id",
        "org_id",
        "title",
        "consent_type",
        "content",
        "visibility",
        "allowed_org_ids",
        "created_by",
    } <= cols


def test_consent_template_org_id_nullable() -> None:
    """平台级模板 org_id IS NULL"""
    from app.db.models.consent_templates import ConsentTemplate

    assert ConsentTemplate.__table__.c.org_id.nullable is True


# ─── consent_records (HIGH) ───────────────────────────────


def test_consent_record_columns_match_drizzle() -> None:
    from app.db.models.consent_records import ConsentRecord

    cols = {c.name for c in ConsentRecord.__table__.columns}
    assert {
        "id",
        "org_id",
        "client_id",
        "consent_type",
        "scope",
        "granted_at",
        "revoked_at",
        "expires_at",
        "document_id",
        "signer_on_behalf_of",
        "status",
    } <= cols


def test_consent_record_signer_on_behalf_of_nullable() -> None:
    """Phase 14: 默认 NULL = 来访者本人签的"""
    from app.db.models.consent_records import ConsentRecord

    assert ConsentRecord.__table__.c.signer_on_behalf_of.nullable is True


def test_consent_record_three_lifecycle_timestamps() -> None:
    """granted_at / revoked_at / expires_at — 3 个独立生命周期时间戳"""
    from app.db.models.consent_records import ConsentRecord

    cols = {c.name for c in ConsentRecord.__table__.columns}
    assert {"granted_at", "revoked_at", "expires_at"} <= cols


def test_consent_record_no_updated_at() -> None:
    """状态变更走时间戳, 不依赖 updated_at"""
    from app.db.models.consent_records import ConsentRecord

    cols = {c.name for c in ConsentRecord.__table__.columns}
    assert "updated_at" not in cols


def test_consent_record_status_default_active() -> None:
    from app.db.models.consent_records import ConsentRecord

    s = ConsentRecord.__table__.c.status
    assert "active" in str(s.server_default.arg)


def test_consent_record_signer_user_fk() -> None:
    """signer_on_behalf_of 软关联到 users 表"""
    from app.db.models.consent_records import ConsentRecord

    fks = list(ConsentRecord.__table__.c.signer_on_behalf_of.foreign_keys)
    assert len(fks) == 1
    assert "users" in fks[0].target_fullname


# ─── service_intakes (HIGH) ───────────────────────────────


def test_service_intake_columns_match_drizzle() -> None:
    from app.db.models.service_intakes import ServiceIntake

    cols = {c.name for c in ServiceIntake.__table__.columns}
    assert {
        "id",
        "org_id",
        "service_id",
        "client_user_id",
        "preferred_counselor_id",
        "intake_source",
        "intake_data",
        "status",
        "assigned_counselor_id",
        "assigned_at",
    } <= cols


def test_service_intake_org_cascade() -> None:
    """org 注销 → intake 全删"""
    from app.db.models.service_intakes import ServiceIntake

    fk = next(iter(ServiceIntake.__table__.c.org_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_service_intake_preferred_counselor_no_fk() -> None:
    """preferred_counselor_id 软关联 (可能跨机构)"""
    from app.db.models.service_intakes import ServiceIntake

    assert len(ServiceIntake.__table__.c.preferred_counselor_id.foreign_keys) == 0


def test_service_intake_assigned_counselor_no_fk() -> None:
    """assigned_counselor_id 软关联"""
    from app.db.models.service_intakes import ServiceIntake

    assert len(ServiceIntake.__table__.c.assigned_counselor_id.foreign_keys) == 0


def test_service_intake_intake_source_default_org_portal() -> None:
    from app.db.models.service_intakes import ServiceIntake

    s = ServiceIntake.__table__.c.intake_source
    assert "org_portal" in str(s.server_default.arg)


def test_service_intake_two_indexes() -> None:
    from app.db.models.service_intakes import ServiceIntake

    names = {idx.name for idx in ServiceIntake.__table__.indexes}
    assert "idx_service_intakes_org" in names
    assert "idx_service_intakes_status" in names


# ─── eap_partnerships ─────────────────────────────────────


def test_eap_partnership_columns_match_drizzle() -> None:
    from app.db.models.eap_partnerships import EAPPartnership

    cols = {c.name for c in EAPPartnership.__table__.columns}
    assert {
        "id",
        "enterprise_org_id",
        "provider_org_id",
        "status",
        "contract_start",
        "contract_end",
        "seat_allocation",
        "service_scope",
        "notes",
        "created_by",
    } <= cols


def test_eap_partnership_unique_pair() -> None:
    from app.db.models.eap_partnerships import EAPPartnership

    names = {idx.name for idx in EAPPartnership.__table__.indexes}
    assert "uq_eap_partnerships_enterprise_provider" in names


# ─── eap_counselor_assignments ────────────────────────────


def test_eap_counselor_assignment_columns_match_drizzle() -> None:
    from app.db.models.eap_counselor_assignments import EAPCounselorAssignment

    cols = {c.name for c in EAPCounselorAssignment.__table__.columns}
    assert {
        "id",
        "partnership_id",
        "counselor_user_id",
        "enterprise_org_id",
        "provider_org_id",
        "status",
        "assigned_at",
        "assigned_by",
        "removed_at",
    } <= cols


# ─── eap_employee_profiles ────────────────────────────────


def test_eap_employee_profile_columns_match_drizzle() -> None:
    from app.db.models.eap_employee_profiles import EAPEmployeeProfile

    cols = {c.name for c in EAPEmployeeProfile.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "employee_id",
        "department",
        "entry_method",
        "is_anonymous",
        "registered_at",
    } <= cols


# ─── eap_usage_events ─────────────────────────────────────


def test_eap_usage_event_columns_match_drizzle() -> None:
    from app.db.models.eap_usage_events import EAPUsageEvent

    cols = {c.name for c in EAPUsageEvent.__table__.columns}
    assert {
        "id",
        "enterprise_org_id",
        "event_type",
        "user_id",
        "department",
        "risk_level",
        "provider_org_id",
        "metadata",
        "event_date",
    } <= cols


def test_eap_usage_event_user_set_null() -> None:
    """user 删除 → 字段置 NULL (事件保留, 用于历史统计)"""
    from app.db.models.eap_usage_events import EAPUsageEvent

    fk = next(iter(EAPUsageEvent.__table__.c.user_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


# ─── eap_crisis_alerts ────────────────────────────────────


def test_eap_crisis_alert_columns_match_drizzle() -> None:
    from app.db.models.eap_crisis_alerts import EAPCrisisAlert

    cols = {c.name for c in EAPCrisisAlert.__table__.columns}
    assert {
        "id",
        "enterprise_org_id",
        "employee_user_id",
        "counselor_user_id",
        "crisis_type",
        "description",
        "notified_contacts",
        "status",
        "resolution_notes",
    } <= cols


# ─── school_classes ───────────────────────────────────────


def test_school_class_columns_match_drizzle() -> None:
    from app.db.models.school_classes import SchoolClass

    cols = {c.name for c in SchoolClass.__table__.columns}
    assert {
        "id",
        "org_id",
        "grade",
        "class_name",
        "homeroom_teacher_id",
        "student_count",
    } <= cols


def test_school_class_homeroom_teacher_set_null() -> None:
    """老师离职 → 班主任置 NULL, 班级保留"""
    from app.db.models.school_classes import SchoolClass

    fk = next(iter(SchoolClass.__table__.c.homeroom_teacher_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


# ─── school_student_profiles ──────────────────────────────


def test_school_student_profile_columns_match_drizzle() -> None:
    from app.db.models.school_student_profiles import SchoolStudentProfile

    cols = {c.name for c in SchoolStudentProfile.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "student_id",
        "grade",
        "class_name",
        "parent_name",
        "parent_phone",
        "parent_email",
        "entry_method",
    } <= cols


# ─── workflow_rules (HIGH) ────────────────────────────────


def test_workflow_rule_columns_match_drizzle() -> None:
    from app.db.models.workflow_rules import WorkflowRule

    cols = {c.name for c in WorkflowRule.__table__.columns}
    assert {
        "id",
        "org_id",
        "scope_assessment_id",
        "name",
        "description",
        "trigger_event",
        "conditions",
        "actions",
        "is_active",
        "priority",
        "source",
        "created_by",
    } <= cols


def test_workflow_rule_scope_assessment_no_fk() -> None:
    """scope_assessment_id 软关联 (Drizzle 端无 .references)"""
    from app.db.models.workflow_rules import WorkflowRule

    assert len(WorkflowRule.__table__.c.scope_assessment_id.foreign_keys) == 0


def test_workflow_rule_org_cascade() -> None:
    from app.db.models.workflow_rules import WorkflowRule

    fk = next(iter(WorkflowRule.__table__.c.org_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_workflow_rule_created_by_set_null() -> None:
    """created_by 删除 → set NULL (规则本身保留)"""
    from app.db.models.workflow_rules import WorkflowRule

    fk = next(iter(WorkflowRule.__table__.c.created_by.foreign_keys))
    assert fk.ondelete == "SET NULL"


def test_workflow_rule_conditions_actions_default_empty_array() -> None:
    """conditions / actions notNull, default 空数组"""
    from app.db.models.workflow_rules import WorkflowRule

    c = WorkflowRule.__table__.c.conditions
    a = WorkflowRule.__table__.c.actions
    assert c.nullable is False
    assert "[]" in str(c.server_default.arg)
    assert a.nullable is False
    assert "[]" in str(a.server_default.arg)


def test_workflow_rule_priority_default_zero() -> None:
    """priority 默认 0 (高优先级先匹配)"""
    from app.db.models.workflow_rules import WorkflowRule

    p = WorkflowRule.__table__.c.priority
    assert "0" in str(p.server_default.arg)


def test_workflow_rule_two_indexes() -> None:
    from app.db.models.workflow_rules import WorkflowRule

    names = {idx.name for idx in WorkflowRule.__table__.indexes}
    assert "idx_workflow_rules_org_trigger_active" in names
    assert "idx_workflow_rules_scope_assessment" in names


# ─── workflow_executions ──────────────────────────────────


def test_workflow_execution_columns_match_drizzle() -> None:
    from app.db.models.workflow_executions import WorkflowExecution

    cols = {c.name for c in WorkflowExecution.__table__.columns}
    assert {
        "id",
        "org_id",
        "rule_id",
        "trigger_event",
        "event_payload",
        "conditions_matched",
        "actions_result",
        "status",
        "error_message",
    } <= cols


def test_workflow_execution_rule_cascade() -> None:
    """rule 删除 → execution 随删 (强绑定)"""
    from app.db.models.workflow_executions import WorkflowExecution

    fk = next(iter(WorkflowExecution.__table__.c.rule_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


# ─── candidate_pool (HIGH polymorphic) ────────────────────


def test_candidate_pool_columns_match_drizzle() -> None:
    from app.db.models.candidate_pool import CandidatePool

    cols = {c.name for c in CandidatePool.__table__.columns}
    assert {
        "id",
        "org_id",
        "client_user_id",
        "kind",
        "suggestion",
        "reason",
        "priority",
        "source_rule_id",
        "source_result_id",
        "source_payload",
        "status",
        "assigned_to_user_id",
        "handled_by_user_id",
        "handled_at",
        "handled_note",
        "resolved_ref_type",
        "resolved_ref_id",
        "target_group_instance_id",
        "target_course_instance_id",
    } <= cols


def test_candidate_pool_source_result_id_no_fk() -> None:
    """source_result_id 软关联 (触发源可能扩展)"""
    from app.db.models.candidate_pool import CandidatePool

    assert len(CandidatePool.__table__.c.source_result_id.foreign_keys) == 0


def test_candidate_pool_resolved_ref_id_polymorphic_no_fk() -> None:
    """resolved_ref_id 跨多种实体, 不加 FK"""
    from app.db.models.candidate_pool import CandidatePool

    assert len(CandidatePool.__table__.c.resolved_ref_id.foreign_keys) == 0


def test_candidate_pool_priority_default_normal() -> None:
    from app.db.models.candidate_pool import CandidatePool

    p = CandidatePool.__table__.c.priority
    assert "normal" in str(p.server_default.arg)


def test_candidate_pool_status_default_pending() -> None:
    from app.db.models.candidate_pool import CandidatePool

    s = CandidatePool.__table__.c.status
    assert "pending" in str(s.server_default.arg)


def test_candidate_pool_target_group_set_null() -> None:
    """target_group_instance 删除 → 字段置 NULL (候选保留)"""
    from app.db.models.candidate_pool import CandidatePool

    fk = next(iter(CandidatePool.__table__.c.target_group_instance_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


def test_candidate_pool_target_course_set_null() -> None:
    from app.db.models.candidate_pool import CandidatePool

    fk = next(iter(CandidatePool.__table__.c.target_course_instance_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


def test_candidate_pool_four_indexes() -> None:
    """4 个索引: 按 status / 按客户 / 按目标团辅 / 按目标课程"""
    from app.db.models.candidate_pool import CandidatePool

    names = {idx.name for idx in CandidatePool.__table__.indexes}
    assert "idx_candidate_pool_org_status_kind" in names
    assert "idx_candidate_pool_client" in names
    assert "idx_candidate_pool_target_group" in names
    assert "idx_candidate_pool_target_course" in names


# ─── ai_call_logs ─────────────────────────────────────────


def test_ai_call_log_columns_match_drizzle() -> None:
    from app.db.models.ai_call_logs import AICallLog

    cols = {c.name for c in AICallLog.__table__.columns}
    assert {
        "id",
        "org_id",
        "user_id",
        "pipeline",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
    } <= cols


def test_ai_call_log_user_set_null() -> None:
    """user 删除 → user_id 置 NULL (log 保留, 用于历史统计)"""
    from app.db.models.ai_call_logs import AICallLog

    fk = next(iter(AICallLog.__table__.c.user_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


# ─── crisis_cases (HIGH, Phase 13) ────────────────────────


def test_crisis_case_columns_match_drizzle() -> None:
    from app.db.models.crisis_cases import CrisisCase

    cols = {c.name for c in CrisisCase.__table__.columns}
    assert {
        "id",
        "org_id",
        "episode_id",
        "candidate_id",
        "stage",
        "checklist",
        "closure_summary",
        "supervisor_note",
        "signed_off_by",
        "signed_off_at",
        "submitted_for_sign_off_at",
        "created_by",
    } <= cols


def test_crisis_case_stage_default_open() -> None:
    """default stage='open' (咨询师正在处置)"""
    from app.db.models.crisis_cases import CrisisCase

    s = CrisisCase.__table__.c.stage
    assert "open" in str(s.server_default.arg)


def test_crisis_case_checklist_required_default_object() -> None:
    """checklist notNull, default 空对象 (5 步检查清单初始化)"""
    from app.db.models.crisis_cases import CrisisCase

    cl = CrisisCase.__table__.c.checklist
    assert cl.nullable is False
    assert "{}" in str(cl.server_default.arg)


def test_crisis_case_episode_unique() -> None:
    """1:1 绑定 episode (一 episode 不会两案)"""
    from app.db.models.crisis_cases import CrisisCase

    names = {idx.name for idx in CrisisCase.__table__.indexes}
    assert "uq_crisis_cases_episode" in names


def test_crisis_case_org_stage_index() -> None:
    """督导面板查 pending_sign_off"""
    from app.db.models.crisis_cases import CrisisCase

    names = {idx.name for idx in CrisisCase.__table__.indexes}
    assert "idx_crisis_cases_org_stage" in names


def test_crisis_case_episode_cascade() -> None:
    from app.db.models.crisis_cases import CrisisCase

    fk = next(iter(CrisisCase.__table__.c.episode_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_crisis_case_candidate_set_null() -> None:
    """candidate 删除 → 字段置 NULL (案件本身保留, 可能咨询师手工开)"""
    from app.db.models.crisis_cases import CrisisCase

    fk = next(iter(CrisisCase.__table__.c.candidate_id.foreign_keys))
    assert fk.ondelete == "SET NULL"


# ─── class_parent_invite_tokens ───────────────────────────


def test_class_parent_invite_token_columns_match_drizzle() -> None:
    from app.db.models.class_parent_invite_tokens import ClassParentInviteToken

    cols = {c.name for c in ClassParentInviteToken.__table__.columns}
    assert {
        "id",
        "org_id",
        "class_id",
        "token",
        "created_by",
        "expires_at",
        "revoked_at",
    } <= cols


def test_class_parent_invite_token_unique_token() -> None:
    """全局唯一 token"""
    from app.db.models.class_parent_invite_tokens import ClassParentInviteToken

    assert ClassParentInviteToken.__table__.c.token.unique is True


# ─── client_relationships ─────────────────────────────────


def test_client_relationship_columns_match_drizzle() -> None:
    from app.db.models.client_relationships import ClientRelationship

    cols = {c.name for c in ClientRelationship.__table__.columns}
    assert {
        "id",
        "org_id",
        "holder_user_id",
        "related_client_user_id",
        "relation",
        "status",
        "bound_via_token_id",
        "accepted_at",
        "revoked_at",
    } <= cols


def test_client_relationship_three_indexes() -> None:
    from app.db.models.client_relationships import ClientRelationship

    names = {idx.name for idx in ClientRelationship.__table__.indexes}
    assert "uq_client_rel_org_holder_related" in names
    assert "idx_client_rel_holder" in names
    assert "idx_client_rel_related" in names


# ─── system_config ────────────────────────────────────────


def test_system_config_columns_match_drizzle() -> None:
    from app.db.models.system_config import SystemConfig

    cols = {c.name for c in SystemConfig.__table__.columns}
    assert {
        "id",
        "category",
        "key",
        "value",
        "description",
        "requires_restart",
        "updated_at",
        "updated_by",
    } <= cols


def test_system_config_unique_category_key() -> None:
    """seed-e2e UPSERT 依赖 ON CONFLICT (category, key)"""
    from app.db.models.system_config import SystemConfig

    names = {idx.name for idx in SystemConfig.__table__.indexes}
    assert "uq_system_config_category_key" in names


def test_system_config_no_created_at() -> None:
    """Drizzle 端只 updated_at, 没 created_at"""
    from app.db.models.system_config import SystemConfig

    cols = {c.name for c in SystemConfig.__table__.columns}
    assert "created_at" not in cols


# ─── re-export ─────────────────────────────────────────────


def test_batch5b_models_re_exported() -> None:
    from app.db.models import (
        AICallLog,
        AuditLog,
        CandidatePool,
        ClassParentInviteToken,
        ClientRelationship,
        ComplianceReview,
        ConsentRecord,
        ConsentTemplate,
        CrisisCase,
        EAPCounselorAssignment,
        EAPCrisisAlert,
        EAPEmployeeProfile,
        EAPPartnership,
        EAPUsageEvent,
        Notification,
        PHIAccessLog,
        SchoolClass,
        SchoolStudentProfile,
        ServiceIntake,
        SystemConfig,
        UserRoleAudit,
        WorkflowExecution,
        WorkflowRule,
    )

    for m in (
        AICallLog,
        AuditLog,
        CandidatePool,
        ClassParentInviteToken,
        ClientRelationship,
        ComplianceReview,
        ConsentRecord,
        ConsentTemplate,
        CrisisCase,
        EAPCounselorAssignment,
        EAPCrisisAlert,
        EAPEmployeeProfile,
        EAPPartnership,
        EAPUsageEvent,
        Notification,
        PHIAccessLog,
        SchoolClass,
        SchoolStudentProfile,
        ServiceIntake,
        SystemConfig,
        UserRoleAudit,
        WorkflowExecution,
        WorkflowRule,
    ):
        assert m is not None
