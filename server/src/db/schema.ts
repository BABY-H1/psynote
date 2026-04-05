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
  settings: jsonb('settings').notNull().default({}),
  triageConfig: jsonb('triage_config').notNull().default({}),
  dataRetentionPolicy: jsonb('data_retention_policy').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // references auth.users(id)
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // org_admin | counselor | client
  permissions: jsonb('permissions').notNull().default({}),
  status: text('status').notNull().default('active'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
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
  status: text('status').notNull().default('pending'),
  followUpPlan: text('follow_up_plan'),
  followUpNotes: text('follow_up_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_referrals_episode').on(t.careEpisodeId),
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
  mode: text('mode').notNull(), // 'simulate' | 'supervise'
  title: text('title'),
  messages: jsonb('messages').notNull().default([]), // ChatMessage[]
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_conversations_episode').on(t.careEpisodeId, t.mode),
]);

// ─── Group Domain ─────────────────────────────────────────────────

export const groupSchemes = pgTable('group_schemes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  theory: text('theory'),
  category: text('category'),
  tags: jsonb('tags').default([]),
  isPublic: boolean('is_public').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groupSchemeSessions = pgTable('group_scheme_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemeId: uuid('scheme_id').notNull().references(() => groupSchemes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  goal: text('goal'),
  activities: text('activities'),
  materials: text('materials'),
  duration: text('duration'),
  sortOrder: integer('sort_order').notNull().default(0),
  relatedAssessmentId: uuid('related_assessment_id').references(() => assessments.id),
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
  screeningAssessmentId: uuid('screening_assessment_id').references(() => assessments.id),
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
  courseType: text('course_type'), // micro_course | series | group_facilitation | workshop
  targetAudience: text('target_audience'), // parent | student | counselor | teacher
  scenario: text('scenario'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  isTemplate: boolean('is_template').notNull().default(false),
  sourceTemplateId: uuid('source_template_id').references((): any => courses.id),
  requirementsConfig: jsonb('requirements_config').default({}), // Structured AI generation requirements
  blueprintData: jsonb('blueprint_data').default({}), // AI-generated blueprint before chapters
  tags: jsonb('tags').default([]), // String array for filtering
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
  userId: uuid('user_id').notNull().references(() => users.id),
  careEpisodeId: uuid('care_episode_id').references(() => careEpisodes.id),
  assignedBy: uuid('assigned_by').references(() => users.id), // Counselor who assigned, null if self-enrolled
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
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consentTemplates = pgTable('consent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  consentType: text('consent_type').notNull(), // treatment | data_collection | ai_processing | data_sharing | research
  content: text('content').notNull(), // full text of the consent document
  isDefault: boolean('is_default').notNull().default(false),
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
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
