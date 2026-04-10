/** Organization member roles */
export type OrgRole = 'org_admin' | 'counselor' | 'admin_staff' | 'client';

/** Session note status (supervision workflow) */
export type NoteStatus = 'draft' | 'finalized' | 'submitted_for_review' | 'reviewed';

/** Member status */
export type MemberStatus = 'active' | 'pending' | 'disabled';

/** Care episode status */
export type EpisodeStatus = 'active' | 'paused' | 'closed' | 'archived';

/** Four-level risk/triage system (Chinese standard) */
export type RiskLevel = 'level_1' | 'level_2' | 'level_3' | 'level_4';

/** Intervention type mapped from risk level */
export type InterventionType = 'course' | 'group' | 'counseling' | 'referral';

/** Appointment status */
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

/** Appointment source */
export type AppointmentSource = 'client_request' | 'risk_triage' | 'counselor_manual' | 'admin_assigned';

/** Session type */
export type SessionType = 'online' | 'offline' | 'phone';

/** Group instance status */
export type GroupStatus = 'draft' | 'recruiting' | 'ongoing' | 'full' | 'ended' | 'paused' | 'archived';

/** Group enrollment status */
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'waitlisted';

/** Group session record status */
export type GroupSessionStatus = 'planned' | 'completed' | 'cancelled';

/** Group session attendance status */
export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late';

/** Scheme visibility */
export type SchemeVisibility = 'personal' | 'organization' | 'public';

/** Course enrollment status */
export type CourseEnrollmentStatus = 'enrolled' | 'completed' | 'dropped';

/** Course project status */
export type CourseStatus = 'draft' | 'blueprint' | 'content_authoring' | 'published' | 'archived';

/** Course type */
export type CourseType = 'micro_course' | 'series' | 'group_facilitation' | 'workshop';

/** Course target audience */
export type TargetAudience = 'parent' | 'student' | 'counselor' | 'teacher';

/** Lesson block types (教案格式 9 types) */
export type LessonBlockType =
  | 'objectives'
  | 'key_points'
  | 'preparation'
  | 'warmup'
  | 'main_activity'
  | 'experience'
  | 'sharing'
  | 'extension'
  | 'reflection';

/** Course instance status */
export type CourseInstanceStatus = 'draft' | 'active' | 'closed' | 'archived';

/** Course publish mode */
export type CoursePublishMode = 'assign' | 'class' | 'public';

/** Course enrollment source */
export type CourseEnrollmentSource = 'assigned' | 'class_batch' | 'public_apply' | 'self_enroll';

/** Course enrollment approval status */
export type CourseApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

/** Course creation mode */
export type CourseCreationMode = 'ai_assisted' | 'manual';

/** Homework question type */
export type HomeworkQuestionType = 'text' | 'single_choice' | 'multi_choice';

/** Homework submission status */
export type HomeworkSubmissionStatus = 'submitted' | 'reviewed';

/** Feedback question type */
export type FeedbackQuestionType = 'text' | 'rating' | 'choice';

/** Gender */
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

/** Marital status */
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'other';

/** Treatment plan status */
export type TreatmentPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

/** Treatment goal status */
export type GoalStatus = 'active' | 'achieved' | 'revised' | 'dropped';

/** Note format */
export type NoteFormat = 'soap' | 'dap' | 'birp' | 'custom';

/** Note template visibility */
export type TemplateVisibility = 'personal' | 'organization' | 'public';

/** Referral target type */
export type ReferralTargetType = 'psychiatric' | 'crisis_center' | 'hospital' | 'external_counselor' | 'other';

/** Referral status */
export type ReferralStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

/** Follow-up plan type */
export type FollowUpPlanType = 'reassessment' | 'callback' | 'check_in';

/** Follow-up review decision */
export type FollowUpDecision = 'continue' | 'escalate' | 'deescalate' | 'close';

/** Care timeline event type */
export type TimelineEventType =
  | 'assessment'
  | 'appointment'
  | 'session_note'
  | 'group_enrollment'
  | 'course_enrollment'
  | 'referral'
  | 'risk_change'
  | 'triage_decision'
  | 'follow_up_plan'
  | 'follow_up_review'
  | 'treatment_plan'
  | 'ai_insight'
  | 'note'
  | 'document';

/** Document type */
export type DocType = 'consent' | 'contract' | 'report' | 'other';

/** Document signing status */
export type DocStatus = 'signed' | 'pending' | 'expired';

/** Consent type */
export type ConsentType = 'treatment' | 'data_collection' | 'ai_processing' | 'data_sharing' | 'research';

/** Consent status */
export type ConsentStatus = 'active' | 'revoked' | 'expired';

/** Assessment report type */
export type ReportType =
  | 'individual_single'
  | 'individual_trend'
  | 'group_single'
  | 'group_trend'
  | 'batch_summary';

/** Batch target type */
export type BatchTargetType = 'all_members' | 'role' | 'custom_list';

/** Batch status */
export type BatchStatus = 'draft' | 'active' | 'closed';

/** Scoring mode */
export type ScoringMode = 'sum' | 'average';

/** Assessment collect mode */
export type CollectMode = 'anonymous' | 'optional_register' | 'require_register';

/** Assessment type */
export type AssessmentType = 'screening' | 'intake' | 'survey' | 'tracking';

/** Assessment status */
export type AssessmentStatus = 'draft' | 'active' | 'archived';

/** Distribution mode */
export type DistributionMode = 'public' | 'internal' | 'both';

/** Distribution status */
export type DistributionStatus = 'draft' | 'active' | 'paused' | 'completed';

/** Custom question type */
export type CustomQuestionType = 'radio' | 'checkbox' | 'text' | 'textarea';

/** Assessment block type */
export type AssessmentBlockType = 'scale' | 'demographics' | 'custom_questions';

/** Subscription plan */
export type OrgPlan = 'free' | 'pro' | 'enterprise';

/** PHI access action */
export type PhiAccessAction = 'view' | 'export' | 'print' | 'share';

/** Audit log action */
export type AuditAction = 'create' | 'update' | 'delete' | 'view' | 'export';
