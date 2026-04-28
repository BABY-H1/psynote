import {
  pgTable, uuid, text, timestamp, boolean, integer,
  numeric, jsonb, date, inet, uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

// ─── Platform Layer ───────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  licenseKey: text('license_key'),
  settings: jsonb('settings').notNull().default({}),
  triageConfig: jsonb('triage_config').notNull().default({}),
  dataRetentionPolicy: jsonb('data_retention_policy').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  isSystemAdmin: boolean('is_system_admin').notNull().default(false),
  /**
   * Phase 14: 标记此 user 是通过家长自助绑定流程创建的"家长账号"。
   * 不影响登录或权限,仅供咨询师端 UI 排序/展示用(避免把家长账号混在
   * 来访者列表里),以及未来分析"非来访者用户量"。
   */
  isGuardianAccount: boolean('is_guardian_account').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * password_reset_tokens (migration 027) —— 密码重置专用一次性 token 表。
 *
 * 安全设计:
 *   - DB 只存 sha256(token),邮件链接里才是明文。即使 DB 被偷,token 不可回放
 *   - 15 min 过期(expiresAt)
 *   - 一次性(usedAt 非 null 即作废)
 *   - 忘记密码对未知邮箱也返回 200,不暴露"邮箱是否注册"
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_password_reset_token_hash').on(t.tokenHash),
  index('idx_password_reset_user_expires').on(t.userId, t.expiresAt),
]);

export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // legacy: org_admin | counselor | client
  // ── Role Architecture V2 (migration 026) ──
  // per-orgType 角色字典。DB trigger `trg_validate_role_v2` 保证 role_v2 ∈
  // orgType 对应的合法角色集。nullable:Phase 1 骨架期,backfill 未跑前为 NULL。
  // 语义见 packages/shared/src/auth/roles.ts。
  roleV2: text('role_v2'),
  // Principal class 决定登录入口(staff→主 app / subject→Portal 自视角 / proxy→监护视角)。
  // CHECK constraint 硬约束只允许 staff|subject|proxy。
  principalClass: text('principal_class'),
  // 单点权限补丁:{ dataClasses: DataClass[], extraScopes: string[], grantedAt, grantedBy, reason }
  // Role 默认策略的覆盖层,Phase 3 UI 接入前默认空。
  accessProfile: jsonb('access_profile'),
  // ── Legacy (保留) ──
  permissions: jsonb('permissions').notNull().default({}),
  status: text('status').notNull().default('active'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  supervisorId: uuid('supervisor_id'),
  fullPracticeAccess: boolean('full_practice_access').notNull().default(false),
  sourcePartnershipId: uuid('source_partnership_id'), // EAP: tracks counselors assigned via partnership
  // Phase 10 — counselor profile fields
  certifications: jsonb('certifications').default([]),
  specialties: text('specialties').array().default([]),
  maxCaseload: integer('max_caseload'),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_org_members_org_user').on(t.orgId, t.userId),
  index('idx_org_members_org').on(t.orgId),
  index('idx_org_members_user').on(t.userId),
]);

export const clientProfiles = pgTable('client_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  gender: text('gender'),
  dateOfBirth: date('date_of_birth'),
  address: text('address'),
  occupation: text('occupation'),
  education: text('education'),
  maritalStatus: text('marital_status'),
  emergencyContact: jsonb('emergency_contact'), // { name, phone, relationship }
  medicalHistory: text('medical_history'),
  familyBackground: text('family_background'),
  presentingIssues: jsonb('presenting_issues').default([]), // string[]
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_client_profile_org_user').on(t.orgId, t.userId),
]);

// ─── Assessment Domain ────────────────────────────────────────────

export const scales = pgTable('scales', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  instructions: text('instructions'),
  scoringMode: text('scoring_mode').notNull().default('sum'),
  isPublic: boolean('is_public').notNull().default(false),
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scaleDimensions = pgTable('scale_dimensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scaleId: uuid('scale_id').notNull().references(() => scales.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  calculationMethod: text('calculation_method').notNull().default('sum'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const dimensionRules = pgTable('dimension_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  dimensionId: uuid('dimension_id').notNull().references(() => scaleDimensions.id, { onDelete: 'cascade' }),
  minScore: numeric('min_score').notNull(),
  maxScore: numeric('max_score').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  advice: text('advice'),
  riskLevel: text('risk_level'), // level_1 | level_2 | level_3 | level_4
});

export const scaleItems = pgTable('scale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  scaleId: uuid('scale_id').notNull().references(() => scales.id, { onDelete: 'cascade' }),
  dimensionId: uuid('dimension_id').references(() => scaleDimensions.id),
  text: text('text').notNull(),
  isReverseScored: boolean('is_reverse_scored').notNull().default(false),
  options: jsonb('options').notNull(), // [{label, value}]
  sortOrder: integer('sort_order').notNull().default(0),
});

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  assessmentType: text('assessment_type').notNull().default('screening'),
  demographics: jsonb('demographics').notNull().default([]),
  blocks: jsonb('blocks').notNull().default([]),
  screeningRules: jsonb('screening_rules').notNull().default({}),
  collectMode: text('collect_mode').notNull().default('anonymous'),
  resultDisplay: jsonb('result_display').notNull().default({ mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] }),
  shareToken: text('share_token'),
  allowClientReport: boolean('allow_client_report').notNull().default(false),
  status: text('status').notNull().default('draft'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentScales = pgTable('assessment_scales', {
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  scaleId: uuid('scale_id').notNull().references(() => scales.id),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.assessmentId, t.scaleId] }),
]);

export const assessmentResults = pgTable('assessment_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  userId: uuid('user_id').references(() => users.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  demographicData: jsonb('demographic_data').notNull().default({}),
  answers: jsonb('answers').notNull(),
  customAnswers: jsonb('custom_answers').notNull().default({}),
  dimensionScores: jsonb('dimension_scores').notNull(),
  totalScore: numeric('total_score'),
  riskLevel: text('risk_level'),
  aiInterpretation: text('ai_interpretation'),
  // Phase 9β — counselor controls whether the client can see the result in the portal.
  // Default false: clinician must explicitly opt-in per result, mirroring SimplePractice MBC
  // but going one step further (SimplePractice doesn't expose results to clients at all).
  clientVisible: boolean('client_visible').notNull().default(false),
  // Phase 9β — AI-generated structured recommendations attached to a completed result.
  // Stored on the result row so the suggestion panel can show them without a re-run.
  // Shape: TriageRecommendation[] from triage.ts
  recommendations: jsonb('recommendations').notNull().default([]),
  batchId: uuid('batch_id').references(() => assessmentBatches.id),
  createdBy: uuid('created_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_results_episode').on(t.careEpisodeId),
  index('idx_results_user').on(t.orgId, t.userId),
]);

export const assessmentBatches = pgTable('assessment_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  title: text('title').notNull(),
  targetType: text('target_type'),
  targetConfig: jsonb('target_config').notNull().default({}),
  deadline: timestamp('deadline', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  stats: jsonb('stats').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_batches_org').on(t.orgId, t.status),
]);

export const assessmentReports = pgTable('assessment_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  reportType: text('report_type').notNull(),
  resultIds: jsonb('result_ids').default([]),
  batchId: uuid('batch_id').references(() => assessmentBatches.id),
  assessmentId: uuid('assessment_id').references(() => assessments.id),
  scaleId: uuid('scale_id').references(() => scales.id),
  content: jsonb('content').notNull(),
  aiNarrative: text('ai_narrative'),
  generatedBy: uuid('generated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const distributions = pgTable('distributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull().default('public'),
  batchLabel: text('batch_label'),
  targets: jsonb('targets').notNull().default([]),
  schedule: jsonb('schedule').notNull().default({}),
  status: text('status').notNull().default('active'),
  completedCount: integer('completed_count').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_distributions_assessment').on(t.assessmentId),
]);

// ─── Counseling Domain ────────────────────────────────────────────

export const careEpisodes = pgTable('care_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  counselorId: uuid('counselor_id').references(() => users.id),
  status: text('status').notNull().default('active'),
  chiefComplaint: text('chief_complaint'),
  currentRisk: text('current_risk').notNull().default('level_1'),
  interventionType: text('intervention_type'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_care_episodes_client').on(t.orgId, t.clientId),
]);

export const careTimeline = pgTable('care_timeline', {
  id: uuid('id').primaryKey().defaultRandom(),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  refId: uuid('ref_id'),
  title: text('title').notNull(),
  summary: text('summary'),
  metadata: jsonb('metadata').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_care_timeline_episode').on(t.careEpisodeId, t.createdAt),
]);

export const counselorAvailability = pgTable('counselor_availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday ... 6=Saturday
  startTime: text('start_time').notNull(), // "HH:mm"
  endTime: text('end_time').notNull(), // "HH:mm"
  sessionType: text('session_type'), // online | offline | phone | null=any
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_availability_counselor').on(t.orgId, t.counselorId, t.dayOfWeek),
  uniqueIndex('uq_availability_slot').on(t.orgId, t.counselorId, t.dayOfWeek, t.startTime),
]);

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  type: text('type'),
  source: text('source'),
  notes: text('notes'),
  reminderSent24h: boolean('reminder_sent_24h').notNull().default(false),
  reminderSent1h: boolean('reminder_sent_1h').notNull().default(false),
  clientConfirmedAt: timestamp('client_confirmed_at', { withTimezone: true }),
  confirmToken: text('confirm_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_appointments_counselor').on(t.counselorId, t.startTime),
  index('idx_appointments_client').on(t.clientId, t.startTime),
]);

export const reminderSettings = pgTable('reminder_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id).unique(),
  enabled: boolean('enabled').notNull().default(true),
  channels: jsonb('channels').notNull().default(['email']), // ['email', 'sms']
  remindBefore: jsonb('remind_before').notNull().default([1440, 60]), // minutes before
  emailConfig: jsonb('email_config').default({}), // SMTP config
  smsConfig: jsonb('sms_config').default({}),
  messageTemplate: jsonb('message_template').default({}), // {subject, body} with placeholders
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteTemplates = pgTable('note_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  format: text('format').notNull(), // soap | dap | birp | custom
  fieldDefinitions: jsonb('field_definitions').notNull().default([]), // [{key, label, placeholder, required, order}]
  isDefault: boolean('is_default').notNull().default(false),
  visibility: text('visibility').notNull().default('personal'), // personal | organization | public
  // Distribution scope for platform-level templates (orgId IS NULL). Empty
  // array = visible to all orgs; non-empty = restricted to listed orgs.
  // Irrelevant for org-owned rows.
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_note_templates_org').on(t.orgId, t.format),
]);

export const sessionNotes = pgTable('session_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  appointmentId: uuid('appointment_id').references(() => appointments.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  noteFormat: text('note_format').notNull().default('soap'), // soap | dap | birp | custom
  templateId: uuid('template_id').references(() => noteTemplates.id),
  sessionDate: date('session_date').notNull(),
  duration: integer('duration'),
  sessionType: text('session_type'),
  subjective: text('subjective'),
  objective: text('objective'),
  assessment: text('assessment'),
  plan: text('plan'),
  fields: jsonb('fields').notNull().default({}), // for non-SOAP formats: {key: value}
  summary: text('summary'),
  tags: jsonb('tags').default([]),
  status: text('status').notNull().default('draft'), // draft | finalized | submitted_for_review | reviewed
  supervisorAnnotation: text('supervisor_annotation'),
  submittedForReviewAt: timestamp('submitted_for_review_at', { withTimezone: true }),
  // NOTE: NO allowed_org_ids here. session_notes is per-client clinical record,
  // never cross-org shared. The previous schema had this column declared by
  // mistake (mirroring library tables), which caused `db.select().from(sessionNotes)`
  // to fail at runtime because the actual DB column never existed (migration 019
  // only added it to scales/note_templates/treatment_goal_library/group_schemes/courses).
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteAttachments = pgTable('note_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  noteId: uuid('note_id').references(() => sessionNotes.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(), // text | audio | image | pdf
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  transcription: text('transcription'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const treatmentPlans = pgTable('treatment_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  status: text('status').notNull().default('draft'), // draft | active | completed | archived
  title: text('title'),
  approach: text('approach'), // free text: CBT, 人本主义, 整合取向, etc.
  goals: jsonb('goals').notNull().default([]), // TreatmentGoal[]
  interventions: jsonb('interventions').notNull().default([]), // TreatmentIntervention[]
  sessionPlan: text('session_plan'), // free text: 每周一次，预计12-16次
  progressNotes: text('progress_notes'),
  reviewDate: date('review_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_treatment_plans_episode').on(t.careEpisodeId, t.status),
]);

export const treatmentGoalLibrary = pgTable('treatment_goal_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  problemArea: text('problem_area').notNull(), // anxiety | depression | relationship | trauma | self_esteem | grief | anger | substance | other
  category: text('category'), // short_term | long_term
  objectivesTemplate: jsonb('objectives_template').notNull().default([]), // suggested measurable objectives
  interventionSuggestions: jsonb('intervention_suggestions').notNull().default([]), // suggested interventions
  visibility: text('visibility').notNull().default('personal'), // personal | organization | public
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_goal_library_org').on(t.orgId, t.problemArea),
]);

export const clientDocuments = pgTable('client_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  templateId: uuid('template_id'), // FK added after consentTemplates table is created
  title: text('title').notNull(),
  content: text('content'), // full document text (copied from template at send time)
  docType: text('doc_type'),
  consentType: text('consent_type'), // treatment | data_collection | ai_processing | ...
  /**
   * 文书接收方身份,用于区分发给来访者本人还是监护人/家长(Phase 13 危机处置工作流引入)。
   *   - 'client'   默认,发给来访者本人签署(原有行为)
   *   - 'guardian' 发给家长/监护人(危机处置场景,由咨询师线下交付并留痕)
   * 当 recipient_type='guardian' 时,client_portal 不会在来访者端展示这份文书。
   */
  recipientType: text('recipient_type').notNull().default('client'),
  /** 监护人姓名/关系,仅当 recipient_type='guardian' 时填写(如 "母亲 王某") */
  recipientName: text('recipient_name'),
  status: text('status').notNull().default('pending'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signatureData: jsonb('signature_data'), // { name, ip, userAgent, timestamp }
  filePath: text('file_path'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_client_documents_client').on(t.orgId, t.clientId, t.status),
]);

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  referredBy: uuid('referred_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  riskSummary: text('risk_summary'),
  targetType: text('target_type'),
  targetName: text('target_name'),
  targetContact: text('target_contact'),
  // Phase 9δ — extended status state machine for the bidirectional flow:
  //   pending  → 已发起，等待来访者同意
  //   consented → 来访者已同意，等待接收方接受 (or PDF download for external mode)
  //   accepted  → 接收方接受
  //   rejected  → 接收方拒绝
  //   completed → 整个流程结束
  //   cancelled → 发送方撤销 (before consented)
  status: text('status').notNull().default('pending'),
  followUpPlan: text('follow_up_plan'),
  followUpNotes: text('follow_up_notes'),
  // Phase 9δ — destination mode: 'platform' = receiver is a psynote user/org;
  // 'external' = generate a PDF + one-time download link for offline transfer.
  mode: text('mode').notNull().default('external'),
  // Phase 9δ — receiver fields for platform-internal transfer
  toCounselorId: uuid('to_counselor_id').references(() => users.id),
  toOrgId: uuid('to_org_id').references(() => organizations.id),
  // Phase 9δ — structured data package selection (which records to share)
  // { sessionNoteIds: string[], assessmentResultIds: string[], treatmentPlanIds: string[],
  //   includeChiefComplaint: boolean, includeRiskHistory: boolean }
  dataPackageSpec: jsonb('data_package_spec').notNull().default({}),
  // Phase 9δ — client knowledge & consent
  consentedAt: timestamp('consented_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  // Phase 9δ — for external mode: opaque token + expiry for the one-time download link
  downloadToken: text('download_token'),
  downloadExpiresAt: timestamp('download_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_referrals_episode').on(t.careEpisodeId),
  index('idx_referrals_to_counselor').on(t.toCounselorId, t.status),
  index('idx_referrals_to_org').on(t.toOrgId, t.status),
]);

export const followUpPlans = pgTable('follow_up_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  planType: text('plan_type'),
  assessmentId: uuid('assessment_id').references(() => assessments.id),
  frequency: text('frequency'),
  nextDue: timestamp('next_due', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_follow_up_plans_due').on(t.orgId, t.nextDue),
]);

export const followUpReviews = pgTable('follow_up_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => followUpPlans.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  reviewDate: timestamp('review_date', { withTimezone: true }).notNull().defaultNow(),
  resultId: uuid('result_id').references(() => assessmentResults.id),
  riskBefore: text('risk_before'),
  riskAfter: text('risk_after'),
  clinicalNote: text('clinical_note'),
  decision: text('decision'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── AI Conversations ────────────────────────────────────────────

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id, { onDelete: 'cascade' }),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  mode: text('mode').notNull(), // 'note' | 'plan' | 'simulate' | 'supervise' (BUG-009: 之前只 simulate/supervise 归档)
  title: text('title'),
  messages: jsonb('messages').notNull().default([]), // ChatMessage[]
  summary: text('summary'),
  /*
   * Phase I Issue 1: mode='note' 的对话在用户点 "保存笔记" 后被关联到
   * 新建的 sessionNote. NULL = 草稿尚未保存; 非 NULL = 该对话是某个
   * sessionNote 的 AI 草稿过程. LeftPanel 用此字段把草稿显示在
   * "会谈记录" 区而不是 "AI 对话" 区. plan/simulate/supervise 的对话
   * 字段恒 NULL (它们不绑定 sessionNote).
   */
  sessionNoteId: uuid('session_note_id').references(() => sessionNotes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_conversations_episode').on(t.careEpisodeId, t.mode),
  index('idx_ai_conversations_session_note').on(t.sessionNoteId),
]);

// ─── Group Domain ─────────────────────────────────────────────────

export const groupSchemes = pgTable('group_schemes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  theory: text('theory'),
  // Goals
  overallGoal: text('overall_goal'),
  specificGoals: jsonb('specific_goals').default([]), // string[]
  // Target audience
  targetAudience: text('target_audience'),
  ageRange: text('age_range'),
  selectionCriteria: text('selection_criteria'),
  // Group settings
  recommendedSize: text('recommended_size'),
  totalSessions: integer('total_sessions'),
  sessionDuration: text('session_duration'),
  frequency: text('frequency'),
  // Facilitator & evaluation
  facilitatorRequirements: text('facilitator_requirements'),
  evaluationMethod: text('evaluation_method'),
  notes: text('notes'), // ethics, exit mechanism, crisis plan
  // Assessment recommendations
  recruitmentAssessments: jsonb('recruitment_assessments').default([]), // uuid[] — recommended recruitment assessments
  overallAssessments: jsonb('overall_assessments').default([]), // uuid[] — recommended overall assessments (longitudinal tracking)
  screeningNotes: text('screening_notes'), // screening criteria description
  // Meta
  visibility: text('visibility').notNull().default('personal'), // personal | organization | public
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groupSchemeSessions = pgTable('group_scheme_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemeId: uuid('scheme_id').notNull().references(() => groupSchemes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  goal: text('goal'),
  phases: jsonb('phases').default([]), // SessionPhase[] — structured activity phases
  materials: text('materials'),
  duration: text('duration'),
  homework: text('homework'),
  assessmentNotes: text('assessment_notes'),
  relatedGoals: jsonb('related_goals').default([]), // number[] — indexes into scheme.specificGoals
  sessionTheory: text('session_theory'),
  sessionEvaluation: text('session_evaluation'),
  sortOrder: integer('sort_order').notNull().default(0),
  relatedAssessments: jsonb('related_assessments').default([]), // uuid[] — assessments linked to this session
});

export const groupInstances = pgTable('group_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  schemeId: uuid('scheme_id').references(() => groupSchemes.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  leaderId: uuid('leader_id').references(() => users.id),
  schedule: text('schedule'),
  duration: text('duration'),
  startDate: date('start_date'),
  location: text('location'),
  status: text('status').notNull().default('draft'),
  capacity: integer('capacity'),
  recruitmentAssessments: jsonb('recruitment_assessments').default([]), // uuid[] — actual recruitment assessments
  overallAssessments: jsonb('overall_assessments').default([]), // uuid[] — actual overall assessments (longitudinal)
  screeningNotes: text('screening_notes'),
  assessmentConfig: jsonb('assessment_config').default({}), // full lifecycle assessment config
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groupEnrollments = pgTable('group_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => groupInstances.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  status: text('status').notNull().default('pending'),
  screeningResultId: uuid('screening_result_id').references(() => assessmentResults.id),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_group_enrollments_instance_user').on(t.instanceId, t.userId),
]);

export const groupSessionRecords = pgTable('group_session_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => groupInstances.id, { onDelete: 'cascade' }),
  schemeSessionId: uuid('scheme_session_id').references(() => groupSchemeSessions.id, { onDelete: 'set null' }),
  sessionNumber: integer('session_number').notNull(),
  title: text('title').notNull(),
  date: date('date'),
  status: text('status').notNull().default('planned'), // planned | completed | cancelled
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_group_session_records_instance').on(t.instanceId),
]);

export const groupSessionAttendance = pgTable('group_session_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionRecordId: uuid('session_record_id').notNull().references(() => groupSessionRecords.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => groupEnrollments.id),
  status: text('status').notNull().default('present'), // present | absent | excused | late
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_group_attendance_session_enrollment').on(t.sessionRecordId, t.enrollmentId),
]);

// ─── Course Domain ────────────────────────────────────────────────

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  coverUrl: text('cover_url'),
  duration: text('duration'),
  isPublic: boolean('is_public').notNull().default(false),
  // New lifecycle fields
  status: text('status').notNull().default('draft'), // draft | blueprint | content_authoring | published | archived
  creationMode: text('creation_mode').notNull().default('manual'), // ai_assisted | manual
  courseType: text('course_type'), // micro_course | series | group_facilitation | workshop
  targetAudience: text('target_audience'), // parent | student | counselor | teacher
  scenario: text('scenario'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  isTemplate: boolean('is_template').notNull().default(false),
  sourceTemplateId: uuid('source_template_id').references((): any => courses.id),
  requirementsConfig: jsonb('requirements_config').default({}), // Structured AI generation requirements
  blueprintData: jsonb('blueprint_data').default({}), // AI-generated blueprint before chapters
  tags: jsonb('tags').default([]), // String array for filtering
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courseChapters = pgTable('course_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  videoUrl: text('video_url'),
  duration: text('duration'),
  sortOrder: integer('sort_order').notNull().default(0),
  relatedAssessmentId: uuid('related_assessment_id').references(() => assessments.id),
  // Blueprint-level session metadata
  sessionGoal: text('session_goal'),
  coreConcepts: text('core_concepts'),
  interactionSuggestions: text('interaction_suggestions'),
  homeworkSuggestion: text('homework_suggestion'),
});

export const courseEnrollments = pgTable('course_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  instanceId: uuid('instance_id').references((): any => courseInstances.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  assignedBy: uuid('assigned_by').references(() => users.id),
  enrollmentSource: text('enrollment_source').default('self_enroll'), // assigned | class_batch | public_apply | self_enroll
  approvalStatus: text('approval_status').default('auto_approved'), // pending | approved | rejected | auto_approved
  approvedBy: uuid('approved_by').references(() => users.id),
  progress: jsonb('progress').notNull().default({}),
  status: text('status').notNull().default('enrolled'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('uq_course_enrollments_course_user').on(t.courseId, t.userId),
]);

export const courseLessonBlocks = pgTable('course_lesson_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
  blockType: text('block_type').notNull(), // opening | objectives | core_content | case_demo | interaction | practice | homework | post_reminder | counselor_notes
  content: text('content'),
  sortOrder: integer('sort_order').notNull().default(0),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  lastAiInstruction: text('last_ai_instruction'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lesson_blocks_chapter').on(t.chapterId, t.sortOrder),
]);

export const courseTemplateTags = pgTable('course_template_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_course_template_tags_org_name').on(t.orgId, t.name),
]);

export const courseAttachments = pgTable('course_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size'),
  sortOrder: integer('sort_order').notNull().default(0),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_attachments_chapter').on(t.chapterId),
]);

/**
 * Phase 9α — C-facing consumable content blocks attached to course chapters.
 * Distinct from `courseLessonBlocks` (teacher-oriented outline); that table is
 * kept as the authoring draft area, this table holds what the learner sees.
 */
export const courseContentBlocks = pgTable('course_content_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
  blockType: text('block_type').notNull(), // video | audio | rich_text | pdf | quiz | reflection | worksheet | check_in
  visibility: text('visibility').notNull().default('participant'), // participant | facilitator | both
  sortOrder: integer('sort_order').notNull().default(0),
  payload: jsonb('payload').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_content_blocks_chapter').on(t.chapterId, t.sortOrder),
]);

/**
 * Phase 9α — Content blocks attached to a group scheme session.
 * Shares type & payload shape with courseContentBlocks via packages/shared.
 */
export const groupSessionBlocks = pgTable('group_session_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemeSessionId: uuid('scheme_session_id').notNull().references(() => groupSchemeSessions.id, { onDelete: 'cascade' }),
  blockType: text('block_type').notNull(),
  visibility: text('visibility').notNull().default('both'), // default 'both' for group sessions
  sortOrder: integer('sort_order').notNull().default(0),
  payload: jsonb('payload').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_group_session_blocks_session').on(t.schemeSessionId, t.sortOrder),
]);

/**
 * Phase 9α — A learner's response/progress for a single content block within an enrollment.
 * Handles two types of enrollment via `enrollmentType` discriminator.
 * `response` is jsonb (or null for "seen/completed" markers with no data).
 * `safetyFlags` carries keyword scan results for reflection/worksheet submissions.
 */
export const enrollmentBlockResponses = pgTable('enrollment_block_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').notNull(), // points to course_enrollments.id or group_enrollments.id
  enrollmentType: text('enrollment_type').notNull(), // 'course' | 'group'
  blockId: uuid('block_id').notNull(), // points to course_content_blocks.id or group_session_blocks.id
  blockType: text('block_type').notNull(),
  response: jsonb('response'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  safetyFlags: jsonb('safety_flags').notNull().default([]),
  reviewedByCounselor: boolean('reviewed_by_counselor').notNull().default(false),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_enrollment_block_response').on(t.enrollmentId, t.enrollmentType, t.blockId),
  index('idx_enrollment_block_responses_enrollment').on(t.enrollmentId, t.enrollmentType),
  index('idx_enrollment_block_responses_safety').on(t.reviewedByCounselor),
]);

export const courseInstances = pgTable('course_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  publishMode: text('publish_mode').notNull().default('assign'), // assign | class | public
  status: text('status').notNull().default('draft'), // draft | active | closed | archived
  capacity: integer('capacity'),
  targetGroupLabel: text('target_group_label'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  assessmentConfig: jsonb('assessment_config').default({}),
  location: text('location'),
  startDate: date('start_date'),
  schedule: text('schedule'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_instances_org').on(t.orgId, t.status),
  index('idx_course_instances_course').on(t.courseId),
]);

export const courseFeedbackForms = pgTable('course_feedback_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => courseInstances.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => courseChapters.id),
  title: text('title'),
  questions: jsonb('questions').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_feedback_forms_instance').on(t.instanceId, t.chapterId),
]);

export const courseFeedbackResponses = pgTable('course_feedback_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id').notNull().references(() => courseFeedbackForms.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => courseEnrollments.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull().default([]),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_feedback_response_form_enrollment').on(t.formId, t.enrollmentId),
]);

export const courseHomeworkDefs = pgTable('course_homework_defs', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => courseInstances.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => courseChapters.id),
  title: text('title'),
  description: text('description'),
  questionType: text('question_type').notNull().default('text'), // text | single_choice | multi_choice
  options: jsonb('options'),
  isRequired: boolean('is_required').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_homework_defs_instance').on(t.instanceId, t.chapterId),
]);

export const courseHomeworkSubmissions = pgTable('course_homework_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  homeworkDefId: uuid('homework_def_id').notNull().references(() => courseHomeworkDefs.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => courseEnrollments.id, { onDelete: 'cascade' }),
  content: text('content'),
  selectedOptions: jsonb('selected_options'),
  status: text('status').notNull().default('submitted'), // submitted | reviewed
  reviewComment: text('review_comment'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_homework_submission_def_enrollment').on(t.homeworkDefId, t.enrollmentId),
]);

export const courseInteractionResponses = pgTable('course_interaction_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockId: uuid('block_id').notNull().references(() => courseLessonBlocks.id, { onDelete: 'cascade' }),
  instanceId: uuid('instance_id').references(() => courseInstances.id),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id),
  responseType: text('response_type').notNull(), // poll | emotion_checkin | anonymous_qa
  responseData: jsonb('response_data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_course_interaction_responses_block').on(t.blockId, t.instanceId),
]);

// ─── Notification & Compliance ────────────────────────────────────

export const complianceReviews = pgTable('compliance_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  careEpisodeId: uuid('care_episode_id').notNull().references(() => careEpisodes.id),
  noteId: uuid('note_id').references(() => sessionNotes.id),
  counselorId: uuid('counselor_id').references(() => users.id),
  reviewType: text('review_type').notNull(), // note_compliance | treatment_quality | golden_thread
  score: integer('score'), // 0-100
  findings: jsonb('findings').notNull().default([]), // [{category, severity, description, suggestion}]
  goldenThreadScore: integer('golden_thread_score'),
  qualityIndicators: jsonb('quality_indicators').default({}), // {empathy, clinicalJudgment, interventionSpecificity, documentationCompleteness}
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: text('reviewed_by').notNull().default('ai'),
}, (t) => [
  index('idx_compliance_reviews_episode').on(t.careEpisodeId),
  index('idx_compliance_reviews_note').on(t.noteId),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  refType: text('ref_type'),
  refId: uuid('ref_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user').on(t.userId, t.isRead, t.createdAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: uuid('resource_id'),
  changes: jsonb('changes'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phiAccessLogs = pgTable('phi_access_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  resource: text('resource').notNull(),
  resourceId: uuid('resource_id'),
  action: text('action').notNull(),
  reason: text('reason'),
  // Migration 026: Role Architecture V2 — data class + actor role snapshot.
  // 记录本次访问数据的 PHI 密级 + 冻结当时的角色,供合规审计追溯。
  dataClass: text('data_class'),
  actorRoleSnapshot: text('actor_role_snapshot'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * user_role_audit (migration 026) —— 角色与权限变更专用审计表。
 *
 * 既有 audit_logs 是通用变更日志,不包含 role snapshot 字段。此表每次
 * org_members.role_v2 / access_profile / principal_class 变更都写一行,
 * 把变更前后快照、执行人当时角色一起冻结,便于按角色演变倒查。
 *
 * action: 'role_change' | 'access_profile_change' | 'principal_class_change'
 */
export const userRoleAudit = pgTable('user_role_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  roleBefore: text('role_before'),
  roleAfter: text('role_after'),
  accessProfileBefore: jsonb('access_profile_before'),
  accessProfileAfter: jsonb('access_profile_after'),
  actorId: uuid('actor_id').references(() => users.id),
  actorRoleSnapshot: text('actor_role_snapshot'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_user_role_audit_org_user').on(t.orgId, t.userId, t.createdAt),
  index('idx_user_role_audit_actor').on(t.actorId, t.createdAt),
]);

export const consentTemplates = pgTable('consent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: platform-level templates owned by the system admin have
  // orgId IS NULL. Set in migration 023.
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  consentType: text('consent_type').notNull(), // treatment | data_collection | ai_processing | data_sharing | research
  content: text('content').notNull(), // full text of the consent document
  visibility: text('visibility').notNull().default('personal'), // personal | organization | public
  // Distribution scope — see noteTemplates.allowedOrgIds for semantics.
  allowedOrgIds: jsonb('allowed_org_ids').default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_consent_templates_org').on(t.orgId, t.consentType),
]);

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  consentType: text('consent_type').notNull(),
  scope: jsonb('scope').notNull().default({}),
  grantedAt: timestamp('granted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  documentId: uuid('document_id').references(() => clientDocuments.id),
  /**
   * Phase 14: 当家长代孩子签同意书时,这里记签字人的 user.id;
   * `clientId` 仍是孩子(被同意约束的人),`signerOnBehalfOf` 是实际签字的家长.
   * 默认 NULL = 来访者本人签的.
   */
  signerOnBehalfOf: uuid('signer_on_behalf_of').references(() => users.id),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Service Intakes (Phase 10) ─────────────────────────────────

export const serviceIntakes = pgTable('service_intakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull(),
  clientUserId: uuid('client_user_id').notNull().references(() => users.id),
  preferredCounselorId: uuid('preferred_counselor_id'),
  intakeSource: text('intake_source').notNull().default('org_portal'),
  intakeData: jsonb('intake_data').default({}),
  status: text('status').notNull().default('pending'), // pending | assigned | cancelled
  assignedCounselorId: uuid('assigned_counselor_id'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_service_intakes_org').on(t.orgId),
  index('idx_service_intakes_status').on(t.orgId, t.status),
]);

// ─── Permission & Data Isolation ─────────────────────────────────

export const clientAssignments = pgTable('client_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => users.id),
  counselorId: uuid('counselor_id').notNull().references(() => users.id),
  isPrimary: boolean('is_primary').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_client_assignments_org_client_counselor').on(t.orgId, t.clientId, t.counselorId),
  index('idx_client_assignments_counselor').on(t.orgId, t.counselorId),
  index('idx_client_assignments_client').on(t.orgId, t.clientId),
]);

export const clientAccessGrants = pgTable('client_access_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => users.id),
  grantedToCounselorId: uuid('granted_to_counselor_id').notNull().references(() => users.id),
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_client_access_grants_org_client_counselor').on(t.orgId, t.clientId, t.grantedToCounselorId),
]);

// ─── EAP Enterprise ─────────────────────────────────────────────

export const eapPartnerships = pgTable('eap_partnerships', {
  id: uuid('id').primaryKey().defaultRandom(),
  enterpriseOrgId: uuid('enterprise_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  providerOrgId: uuid('provider_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'), // active | suspended | expired
  contractStart: timestamp('contract_start', { withTimezone: true }),
  contractEnd: timestamp('contract_end', { withTimezone: true }),
  seatAllocation: integer('seat_allocation'),
  serviceScope: jsonb('service_scope').notNull().default({}),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_eap_partnerships_enterprise_provider').on(t.enterpriseOrgId, t.providerOrgId),
  index('idx_eap_partnerships_enterprise').on(t.enterpriseOrgId, t.status),
  index('idx_eap_partnerships_provider').on(t.providerOrgId, t.status),
]);

export const eapCounselorAssignments = pgTable('eap_counselor_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnershipId: uuid('partnership_id').notNull().references(() => eapPartnerships.id, { onDelete: 'cascade' }),
  counselorUserId: uuid('counselor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  enterpriseOrgId: uuid('enterprise_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  providerOrgId: uuid('provider_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'), // active | removed
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  assignedBy: uuid('assigned_by').references(() => users.id),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('uq_eap_assignments_enterprise_counselor').on(t.enterpriseOrgId, t.counselorUserId),
  index('idx_eap_assignments_counselor').on(t.counselorUserId, t.status),
  index('idx_eap_assignments_enterprise').on(t.enterpriseOrgId, t.status),
]);

export const eapEmployeeProfiles = pgTable('eap_employee_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id'),
  department: text('department'),
  entryMethod: text('entry_method').default('link'), // qr_code | link | sso | hr_import
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_eap_employees_org_user').on(t.orgId, t.userId),
  index('idx_eap_employees_org_dept').on(t.orgId, t.department),
]);

export const eapUsageEvents = pgTable('eap_usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  enterpriseOrgId: uuid('enterprise_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // assessment_completed | course_enrolled | group_enrolled | group_participated | session_booked | session_completed | crisis_flagged
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  department: text('department'),
  riskLevel: text('risk_level'), // level_1 | level_2 | level_3 | level_4
  providerOrgId: uuid('provider_org_id').references(() => organizations.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').default({}),
  eventDate: date('event_date').notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_eap_events_org_type_date').on(t.enterpriseOrgId, t.eventType, t.eventDate),
  index('idx_eap_events_org_dept_date').on(t.enterpriseOrgId, t.department, t.eventDate),
]);

export const eapCrisisAlerts = pgTable('eap_crisis_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  enterpriseOrgId: uuid('enterprise_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  employeeUserId: uuid('employee_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  counselorUserId: uuid('counselor_user_id').notNull().references(() => users.id),
  crisisType: text('crisis_type').notNull(), // self_harm | harm_others | abuse
  description: text('description'),
  notifiedContacts: jsonb('notified_contacts').default([]),
  status: text('status').notNull().default('open'), // open | handling | resolved
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_eap_crisis_org').on(t.enterpriseOrgId, t.status),
]);

// ─── School ─────────────────────────────────────────────────────

export const schoolClasses = pgTable('school_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  grade: text('grade').notNull(),
  className: text('class_name').notNull(),
  homeroomTeacherId: uuid('homeroom_teacher_id').references(() => users.id, { onDelete: 'set null' }),
  studentCount: integer('student_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_school_classes_org_grade_class').on(t.orgId, t.grade, t.className),
  index('idx_school_classes_org').on(t.orgId),
]);

export const schoolStudentProfiles = pgTable('school_student_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: text('student_id'),
  grade: text('grade'),
  className: text('class_name'),
  parentName: text('parent_name'),
  parentPhone: text('parent_phone'),
  parentEmail: text('parent_email'),
  entryMethod: text('entry_method').default('import'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_school_students_org_user').on(t.orgId, t.userId),
  index('idx_school_students_org_grade').on(t.orgId, t.grade),
]);

// ─── Workflow Rule Engine ────────────────────────────────────────

/**
 * 机构级自动化规则。
 *
 * 语义:**当** triggerEvent 发生 + **满足** conditions + **执行** actions。
 *
 * MVP 范围:
 *   - triggerEvent 仅支持 'assessment_result.created'
 *   - conditions 是下拉式 JSON 数组(见 WorkflowCondition 类型)
 *   - actions 是按序执行的数组,仅支持 'assign_course' 和 'create_candidate_entry'
 *
 * 关键设计:规则引擎**不**直接发短信/邮件等对外联系。所有外部动作一律走
 * `candidate_pool`,由对应角色(咨询师 / 心理老师 / 管理员)在 UI 里手动决定。
 * 这是合规 + 责任边界的硬性要求。
 */
export const workflowRules = pgTable('workflow_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  /**
   * 规则的作用域 —— 这是核心设计决策。
   *   - 非空 = "测评级规则",只在该 assessmentId 触发时执行
   *   - NULL = 预留给"跨测评通用规则"(暂未开放 UI)
   *
   * 主要 UI 入口是测评编辑器的"筛查规则"步骤,写入时带上本测评 ID。
   * 引擎读取时 `WHERE scope_assessment_id = <本次测评> OR scope_assessment_id IS NULL`。
   */
  scopeAssessmentId: uuid('scope_assessment_id'),
  name: text('name').notNull(),
  description: text('description'),
  triggerEvent: text('trigger_event').notNull(), // 'assessment_result.created' | ...
  conditions: jsonb('conditions').notNull().default([]), // WorkflowCondition[]
  actions: jsonb('actions').notNull().default([]), // WorkflowAction[]
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0), // 高在前
  /** 如果规则由测评向导自动同步生成,这里记一下,方便重新同步时能定位到旧行。 */
  source: text('source'), // 'assessment_wizard' | 'manual'
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_workflow_rules_org_trigger_active').on(t.orgId, t.triggerEvent, t.isActive),
  index('idx_workflow_rules_scope_assessment').on(t.scopeAssessmentId),
]);

/**
 * 规则执行日志。每次触发都写一行,包括条件匹配结果和动作执行结果。
 * 用于:① UI 展示"规则最近执行了几次" ② 调试规则没触发的原因。
 */
export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => workflowRules.id, { onDelete: 'cascade' }),
  triggerEvent: text('trigger_event').notNull(),
  eventPayload: jsonb('event_payload').notNull().default({}),
  conditionsMatched: boolean('conditions_matched').notNull(),
  actionsResult: jsonb('actions_result').notNull().default([]), // per-action { actionType, status, detail }
  status: text('status').notNull(), // 'success' | 'partial' | 'failed' | 'skipped'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_workflow_executions_org_rule').on(t.orgId, t.ruleId, t.createdAt),
]);

/**
 * 候选池 —— 规则引擎**不会自动执行**的那些动作的产物。
 *
 * 比如"level_3 建议建个案"触发后,系统不会直接建个案,而是往这张表写一条
 * `kind='episode_candidate'` 的候选,咨询师在协作中心"待处理候选"tab 看到,
 * 决定是否真的建个案。
 *
 * 学校团辅候选 `kind='group_candidate'` 尤其如此,要配合班级课表人工组人。
 * 危机候选 `kind='crisis_candidate'` 更是要咨询师手动二次访谈 → 决定是否联系家长。
 */
export const candidatePool = pgTable('candidate_pool', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  // 候选人(来访者)
  clientUserId: uuid('client_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 候选类型
  kind: text('kind').notNull(), // 'episode_candidate' | 'group_candidate' | 'crisis_candidate' | 'course_candidate'
  // 规则产生的建议(显示在卡片上)
  suggestion: text('suggestion').notNull(),
  reason: text('reason'), // 为什么入池 —— 规则文案 / 风险等级
  priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high' | 'urgent'
  // 来源
  sourceRuleId: uuid('source_rule_id').references(() => workflowRules.id, { onDelete: 'set null' }),
  sourceResultId: uuid('source_result_id'), // 指向 assessment_results,不强制 FK(触发源可能扩展)
  sourcePayload: jsonb('source_payload').default({}), // 触发时的事件 payload 快照
  // 状态
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'dismissed' | 'expired'
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }), // 建议的处理人(如"轮值咨询师")
  handledByUserId: uuid('handled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  handledNote: text('handled_note'),
  // 接受后关联到的实体(比如 accepted 后创建了个案,这里存个案 id)
  resolvedRefType: text('resolved_ref_type'),
  resolvedRefId: uuid('resolved_ref_id'),
  // 候选目标服务:规则作者在规则 action.config 里指定的"打算把这个人加到哪个团辅/课程"
  // 仅对 group_candidate / course_candidate 两类有意义;crisis / episode 候选可留空。
  // 填了之后,团辅/课程详情页的"候选"tab 就能反查"指向本服务的候选名单"。
  targetGroupInstanceId: uuid('target_group_instance_id').references(() => groupInstances.id, { onDelete: 'set null' }),
  targetCourseInstanceId: uuid('target_course_instance_id').references(() => courseInstances.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_candidate_pool_org_status_kind').on(t.orgId, t.status, t.kind),
  index('idx_candidate_pool_client').on(t.clientUserId, t.status),
  index('idx_candidate_pool_target_group').on(t.targetGroupInstanceId, t.status),
  index('idx_candidate_pool_target_course').on(t.targetCourseInstanceId, t.status),
]);

// ─── AI Usage Tracking ───────────────────────────────────────────

/**
 * 记录每次 AI pipeline 调用的 token 使用量，用于按机构统计月度用量、
 * 对照 `organizations.settings.aiConfig.monthlyTokenLimit` 给出剩余额度。
 *
 * 写入由 AIClient 在 chat 请求成功后自动完成（依赖调用方传入 orgId）。
 */
export const aiCallLogs = pgTable('ai_call_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  pipeline: text('pipeline').notNull(), // e.g. 'triage' | 'soap-analysis' | 'risk-detection'
  model: text('model'),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_call_logs_org_created').on(t.orgId, t.createdAt),
]);

// ─── Crisis Handling (Phase 13) ──────────────────────────────────

/**
 * 危机处置案件 —— 1:1 绑定 care_episode.
 *
 * 当咨询师接手危机候选(candidate_pool.kind='crisis_candidate')时,
 * 系统会原子创建:
 *   - 一个 care_episode (interventionType='crisis', currentRisk='level_4')
 *   - 一条 crisis_cases 记录(清单状态)
 * 并回填 candidate_pool.resolvedRefType='crisis_case' / resolvedRefId=<id>.
 *
 * 设计决策(见 plan):
 *   - 清单状态(5 步完成情况)单独存在这里,不污染 care_episodes 通用表
 *   - 每次 checklist 步骤更新也往 care_timeline 写一条事件,这样 CaseTimeline
 *     UI 能直接渲染处置轨迹,不用改 timeline 聚合逻辑
 *   - 结案必须督导 sign-off: counselor 提交 → pending_sign_off → 督导点
 *     确认 → closed(同时关闭关联 careEpisode)
 */
export const crisisCases = pgTable('crisis_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  /** 1:1 绑定 care_episode —— 同一个 episode 不会有第二条 crisis_cases */
  episodeId: uuid('episode_id').notNull().references(() => careEpisodes.id, { onDelete: 'cascade' }),
  /** 触发源: candidate_pool 行(可能为 null,比如咨询师直接手工开危机案件) */
  candidateId: uuid('candidate_id').references(() => candidatePool.id, { onDelete: 'set null' }),
  /**
   * 案件阶段:
   *   'open'              咨询师正在处置
   *   'pending_sign_off'  咨询师已提交结案,等督导审核
   *   'closed'            督导已确认结案
   *   'reopened'          督导退回修改(回到 open,保留审计留痕)
   */
  stage: text('stage').notNull().default('open'),
  /**
   * 5 步检查清单的状态.形如:
   *   {
   *     reinterview:   { done: true,  completedAt: ISO, noteId?, summary? },
   *     parentContact: { done: true,  completedAt: ISO, method, contactName, summary },
   *     documents:     { done: true,  completedAt: ISO, documentIds: [...] },
   *     referral:      { done: false, skipped?: true,  skipReason? },
   *     followUp:      { done: false, skipped?: true,  skipReason? },
   *   }
   * 每步结构由 @psynote/shared 的 CrisisChecklist 类型定义.
   */
  checklist: jsonb('checklist').notNull().default({}),
  /** 咨询师提交结案时填的摘要(会展示给督导审核) */
  closureSummary: text('closure_summary'),
  /** 督导结案/退回时的备注 */
  supervisorNote: text('supervisor_note'),
  /** 督导 sign-off */
  signedOffBy: uuid('signed_off_by').references(() => users.id, { onDelete: 'set null' }),
  signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
  /** 提交审核时间(用于督导列表排序) */
  submittedForSignOffAt: timestamp('submitted_for_sign_off_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_crisis_cases_episode').on(t.episodeId),
  index('idx_crisis_cases_org_stage').on(t.orgId, t.stage),
]);

// ─── Parent Self-Binding (Phase 14) ──────────────────────────────

/**
 * 班级级别的"家长邀请二维码 token"。
 *
 * 设计核心: 老师**不能**一人一发邀请(学生太多)。改成给每个班级生成一个
 * 共享 token,二维码贴到家长群里,N 个家长扫码自助绑定。
 *
 * 同班学生共享一个 token —— 防止跨班冒认靠 `class_id` 限定查询范围。
 */
export const classParentInviteTokens = pgTable('class_parent_invite_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => schoolClasses.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_class_parent_tokens_class').on(t.classId),
]);

/**
 * 家长 ↔ 来访者(孩子)的绑定关系。
 *
 * MVP 极简: 不在表上做权限粒度字段;数据可见性由 client.routes 的硬编码
 * 白名单/黑名单实现(只有 dashboard / appointments / documents / consents /
 * counselors 这些路由才接受 `?as=` 参数,其它一律 403)。
 *
 * `holderUserId` = 家长的 user.id (持有关系的人)
 * `relatedClientUserId` = 孩子的 user.id (被关联的来访者)
 */
export const clientRelationships = pgTable('client_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  holderUserId: uuid('holder_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  relatedClientUserId: uuid('related_client_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'father' | 'mother' | 'guardian' | 'other' */
  relation: text('relation').notNull(),
  /** 'active' | 'revoked' */
  status: text('status').notNull().default('active'),
  /** 通过哪个班级 token 绑定的(用于审计 + "由 X 老师邀请"提示) */
  boundViaTokenId: uuid('bound_via_token_id').references(() => classParentInviteTokens.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_client_rel_org_holder_related').on(t.orgId, t.holderUserId, t.relatedClientUserId),
  index('idx_client_rel_holder').on(t.holderUserId),
  index('idx_client_rel_related').on(t.relatedClientUserId),
]);

// ─── System Configuration ────────────────────────────────────────

export const systemConfig = pgTable('system_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  description: text('description'),
  requiresRestart: boolean('requires_restart').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
}, (t) => [
  // Migration 017 declared this UNIQUE constraint but it was never
  // ported into the drizzle schema source. seed-e2e's rate-limit UPSERT
  // needs it (`ON CONFLICT (category, key)`), and `drizzle-kit push`
  // only mirrors what's declared here. Adding it keeps the CI DB and
  // any legacy DB that already has the constraint converge on the
  // same shape.
  uniqueIndex('uq_system_config_category_key').on(t.category, t.key),
]);
