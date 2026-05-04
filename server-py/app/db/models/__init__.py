"""ORM 模型 re-export — 让短导入 ``from app.db.models import User`` 可用。

一表一文件, 平铺 (不分 domain 子目录) — 75 张表导入路径整齐, IDE 辅助跳转友好。
当前已落地的 batch:
  Batch 1 (Phase 2.2):  organizations / users / password_reset_tokens
  Batch 2 (Phase 2.3):  org_members / client_profiles / client_assignments / client_access_grants
  Batch 3 (Phase 2.4):  care_episodes / scales / assessments / courses / group_schemes / group_enrollments
  Batch 4a (Phase 2.5a): assessment 域 8 张子表
  Batch 4b (Phase 2.5b): counseling + followup + ai 域 14 张表
  Batch 5a (Phase 2.5c): group + course 子表 ~17 张
  Batch 5b (Phase 2.5d): audit / notification / member / consent / eap / school / workflow / ai_logs / crisis / system 共 23 张

每个 import 旁标 Drizzle 源行号便于跨语言 review。
"""

from __future__ import annotations

# Batch 4b — AI 域 ───────────────────────────────────────────────
from app.db.models.ai_call_logs import AICallLog  # schema.ts:1360
from app.db.models.ai_conversations import AIConversation  # schema.ts:566

# Phase 2 决策 (不在 Drizzle schema, Alembic 0001 新建) ──────────────
from app.db.models.ai_credentials import AICredential  # Phase 2 BYOK

# Batch 4b — counseling 域 ──────────────────────────────────────
from app.db.models.appointments import Appointment  # schema.ts:323

# Batch 3 (Phase 2.4) ─────────────────────────────────────────────
from app.db.models.assessment_batches import AssessmentBatch  # schema.ts:228
from app.db.models.assessment_reports import AssessmentReport  # schema.ts:244
from app.db.models.assessment_results import AssessmentResult  # schema.ts:191
from app.db.models.assessment_scales import AssessmentScale  # schema.ts:183
from app.db.models.assessments import Assessment  # schema.ts:162

# Batch 5b — audit / notification / etc ────────────────────────
from app.db.models.audit_logs import AuditLog  # schema.ts:983

# Batch 5b — workflow ────────────────────────────────────────────
from app.db.models.candidate_pool import CandidatePool  # schema.ts:1315
from app.db.models.care_episodes import CareEpisode  # schema.ts:277
from app.db.models.care_timeline import CareTimeline  # schema.ts:294

# Batch 5b — school (Phase 14) ──────────────────────────────────
from app.db.models.class_parent_invite_tokens import ClassParentInviteToken  # schema.ts:1446
from app.db.models.client_access_grants import ClientAccessGrant  # schema.ts:1112

# Batch 2 (Phase 2.3) ─────────────────────────────────────────────
from app.db.models.client_assignments import ClientAssignment  # schema.ts:1099
from app.db.models.client_documents import ClientDocument  # schema.ts:458
from app.db.models.client_profiles import ClientProfile  # schema.ts:94
from app.db.models.client_relationships import ClientRelationship  # schema.ts:1469
from app.db.models.compliance_reviews import ComplianceReview  # schema.ts:950
from app.db.models.consent_records import ConsentRecord  # schema.ts:1058
from app.db.models.consent_templates import ConsentTemplate  # schema.ts:1040
from app.db.models.counselor_availability import CounselorAvailability  # schema.ts:308

# Batch 5a — course 子表 ────────────────────────────────────────
from app.db.models.course_chapters import CourseChapter  # schema.ts:734
from app.db.models.course_content_blocks import CourseContentBlock  # schema.ts:803
from app.db.models.course_enrollments import CourseEnrollment  # schema.ts:750
from app.db.models.course_feedback_forms import CourseFeedbackForm  # schema.ts:883
from app.db.models.course_feedback_responses import CourseFeedbackResponse  # schema.ts:895
from app.db.models.course_homework_defs import CourseHomeworkDef  # schema.ts:905
from app.db.models.course_homework_submissions import CourseHomeworkSubmission  # schema.ts:920
from app.db.models.course_instances import CourseInstance  # schema.ts:860
from app.db.models.course_interaction_responses import CourseInteractionResponse  # schema.ts:936
from app.db.models.course_lesson_blocks import CourseLessonBlock  # schema.ts:768
from app.db.models.course_template_tags import CourseTemplateTag  # schema.ts:782
from app.db.models.courses import Course  # schema.ts:707
from app.db.models.crisis_cases import CrisisCase  # schema.ts:1392
from app.db.models.dimension_rules import DimensionRule  # schema.ts:141
from app.db.models.distributions import Distribution  # schema.ts:259

# Batch 5b — eap ─────────────────────────────────────────────────
from app.db.models.eap_counselor_assignments import EAPCounselorAssignment  # schema.ts:1147
from app.db.models.eap_crisis_alerts import EAPCrisisAlert  # schema.ts:1193
from app.db.models.eap_employee_profiles import EAPEmployeeProfile  # schema.ts:1163
from app.db.models.eap_partnerships import EAPPartnership  # schema.ts:1128
from app.db.models.eap_usage_events import EAPUsageEvent  # schema.ts:1177

# Batch 5a — polymorphic ────────────────────────────────────────
from app.db.models.enrollment_block_responses import EnrollmentBlockResponse  # schema.ts:841

# Batch 4b — followup 域 ────────────────────────────────────────
from app.db.models.follow_up_plans import FollowUpPlan  # schema.ts:534
from app.db.models.follow_up_reviews import FollowUpReview  # schema.ts:550
from app.db.models.group_enrollments import GroupEnrollment  # schema.ts:666

# Batch 5a — group 子表 ─────────────────────────────────────────
from app.db.models.group_instances import GroupInstance  # schema.ts:643
from app.db.models.group_scheme_sessions import GroupSchemeSession  # schema.ts:626
from app.db.models.group_schemes import GroupScheme  # schema.ts:592
from app.db.models.group_session_attendance import GroupSessionAttendance  # schema.ts:694
from app.db.models.group_session_blocks import GroupSessionBlock  # schema.ts:821
from app.db.models.group_session_records import GroupSessionRecord  # schema.ts:679
from app.db.models.note_attachments import NoteAttachment  # schema.ts:408
from app.db.models.note_templates import NoteTemplate  # schema.ts:358
from app.db.models.notifications import Notification  # schema.ts:968
from app.db.models.org_members import OrgMember  # schema.ts:59
from app.db.models.organizations import Organization  # schema.ts:8
from app.db.models.password_reset_tokens import PasswordResetToken  # schema.ts:47
from app.db.models.phi_access_logs import PHIAccessLog  # schema.ts:995
from app.db.models.referrals import Referral  # schema.ts:487
from app.db.models.reminder_settings import ReminderSettings  # schema.ts:345

# Batch 4a (Phase 2.5a) ───────────────────────────────────────────
from app.db.models.scale_dimensions import ScaleDimension  # schema.ts:132
from app.db.models.scale_items import ScaleItem  # schema.ts:152

# Batch 1 (Phase 2.2) ─────────────────────────────────────────────
from app.db.models.scales import Scale  # schema.ts:118
from app.db.models.school_classes import SchoolClass  # schema.ts:1211
from app.db.models.school_student_profiles import SchoolStudentProfile  # schema.ts:1224
from app.db.models.service_intakes import ServiceIntake  # schema.ts:1080
from app.db.models.session_notes import SessionNote  # schema.ts:377

# Batch 5b — system ─────────────────────────────────────────────
from app.db.models.system_config import SystemConfig  # schema.ts:1491
from app.db.models.treatment_goal_library import TreatmentGoalLibrary  # schema.ts:440
from app.db.models.treatment_plans import TreatmentPlan  # schema.ts:421
from app.db.models.user_role_audit import UserRoleAudit  # schema.ts:1022
from app.db.models.users import User  # schema.ts:21
from app.db.models.workflow_executions import WorkflowExecution  # schema.ts:1290
from app.db.models.workflow_rules import WorkflowRule  # schema.ts:1257

__all__ = [
    "AICallLog",
    "AIConversation",
    "AICredential",
    "Appointment",
    "Assessment",
    "AssessmentBatch",
    "AssessmentReport",
    "AssessmentResult",
    "AssessmentScale",
    "AuditLog",
    "CandidatePool",
    "CareEpisode",
    "CareTimeline",
    "ClassParentInviteToken",
    "ClientAccessGrant",
    "ClientAssignment",
    "ClientDocument",
    "ClientProfile",
    "ClientRelationship",
    "ComplianceReview",
    "ConsentRecord",
    "ConsentTemplate",
    "CounselorAvailability",
    "Course",
    "CourseChapter",
    "CourseContentBlock",
    "CourseEnrollment",
    "CourseFeedbackForm",
    "CourseFeedbackResponse",
    "CourseHomeworkDef",
    "CourseHomeworkSubmission",
    "CourseInstance",
    "CourseInteractionResponse",
    "CourseLessonBlock",
    "CourseTemplateTag",
    "CrisisCase",
    "DimensionRule",
    "Distribution",
    "EAPCounselorAssignment",
    "EAPCrisisAlert",
    "EAPEmployeeProfile",
    "EAPPartnership",
    "EAPUsageEvent",
    "EnrollmentBlockResponse",
    "FollowUpPlan",
    "FollowUpReview",
    "GroupEnrollment",
    "GroupInstance",
    "GroupScheme",
    "GroupSchemeSession",
    "GroupSessionAttendance",
    "GroupSessionBlock",
    "GroupSessionRecord",
    "NoteAttachment",
    "NoteTemplate",
    "Notification",
    "OrgMember",
    "Organization",
    "PHIAccessLog",
    "PasswordResetToken",
    "Referral",
    "ReminderSettings",
    "Scale",
    "ScaleDimension",
    "ScaleItem",
    "SchoolClass",
    "SchoolStudentProfile",
    "ServiceIntake",
    "SessionNote",
    "SystemConfig",
    "TreatmentGoalLibrary",
    "TreatmentPlan",
    "User",
    "UserRoleAudit",
    "WorkflowExecution",
    "WorkflowRule",
]
