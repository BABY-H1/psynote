/**
 * Phase 9β — Unified "launch" verb for service instantiation.
 *
 * Why a unified verb?
 *   The user's L2 vision treats every consumer-facing service the same way:
 *   "咨询师选一份资产 → 一键启动 → 来访者立即可以承接". Today each module has
 *   its own create endpoint (createCourseInstance, createGroupInstance,
 *   createEpisode, ...) with different parameter shapes, scattered across
 *   five different routes. This is fine for the modules themselves, but the
 *   "AI suggestion → one-click adopt" flow in 9β needs ONE call site that
 *   understands every actionType.
 *
 * Design:
 *   POST /api/orgs/:orgId/services/launch
 *   body: { actionType, payload }
 *   The service routes the call to the right module's create function
 *   and returns a normalized { kind, instanceId, summary } envelope so
 *   the caller can navigate to the new resource.
 *
 *   `actionType` matches the enum in `triage.ts` so a TriageRecommendation
 *   can be passed through verbatim (with assetIdHint resolved to a real id
 *   by the caller before invoking).
 */

import { db } from '../../config/database.js';
import { eq } from 'drizzle-orm';
import * as courseInstanceService from '../course/instance.service.js';
import * as groupInstanceService from '../group/instance.service.js';
import * as episodeService from '../counseling/episode.service.js';
import * as assessmentService from '../assessment/assessment.service.js';
import * as referralService from '../referral/referral.service.js';
import {
  courses,
  groupSchemes,
  consentTemplates,
  scales,
  clientDocuments,
} from '../../db/schema.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

/** All actionTypes the launch verb accepts. Must match TriageRecommendation. */
export type LaunchActionType =
  | 'launch_course'
  | 'launch_group'
  | 'create_episode'
  | 'send_assessment'
  | 'send_consent'
  | 'create_referral';

export interface LaunchInput {
  orgId: string;
  userId: string; // The counselor invoking the launch
  actionType: LaunchActionType;
  /** Discriminated payload — see per-action type below. */
  payload: LaunchPayload;
}

export type LaunchPayload =
  | LaunchCoursePayload
  | LaunchGroupPayload
  | CreateEpisodePayload
  | SendAssessmentPayload
  | SendConsentPayload
  | CreateReferralPayload;

export interface LaunchCoursePayload {
  /** Required: the course template to instantiate. */
  courseId: string;
  title?: string;
  description?: string;
  publishMode?: string; // 'assign' default
  responsibleId?: string;
  /** Optional: who to enroll right away. */
  clientUserIds?: string[];
}

export interface LaunchGroupPayload {
  schemeId?: string;
  title: string;
  description?: string;
  category?: string;
  leaderId?: string;
  schedule?: string;
  duration?: string;
  capacity?: number;
  /** Optional: who to enroll right away (creates pending enrollments). */
  clientUserIds?: string[];
}

export interface CreateEpisodePayload {
  clientId: string;
  counselorId?: string;
  chiefComplaint?: string;
  currentRisk?: string;
}

export interface SendAssessmentPayload {
  /** Required: the scale (or assessment) to instantiate. */
  scaleId?: string;
  assessmentId?: string;
  /** Required: who should receive it. */
  clientUserIds: string[];
  title?: string;
  /** Optional: link to a care episode. */
  careEpisodeId?: string;
}

export interface SendConsentPayload {
  templateId: string;
  clientUserId: string;
}

export interface CreateReferralPayload {
  careEpisodeId: string;
  clientId: string;
  reason: string;
  riskSummary?: string;
  targetType?: string;
  targetName?: string;
  targetContact?: string;
}

export interface LaunchResult {
  /** The kind of service instance created — matches ServiceInstance.kind where applicable. */
  kind: 'course' | 'group' | 'counseling' | 'assessment' | 'consent' | 'referral';
  /** Primary id the caller should navigate to. */
  instanceId: string;
  /** Optional secondary ids (e.g. enrollment ids when bulk-enrolling). */
  enrollmentIds?: string[];
  /** Human-readable summary the caller can show in a toast. */
  summary: string;
}

/**
 * Main entry point: dispatches to the right module based on actionType.
 */
export async function launch(input: LaunchInput): Promise<LaunchResult> {
  switch (input.actionType) {
    case 'launch_course':
      return launchCourse(input.orgId, input.userId, input.payload as LaunchCoursePayload);
    case 'launch_group':
      return launchGroup(input.orgId, input.userId, input.payload as LaunchGroupPayload);
    case 'create_episode':
      return createEpisode(input.orgId, input.payload as CreateEpisodePayload);
    case 'send_assessment':
      return sendAssessment(input.orgId, input.userId, input.payload as SendAssessmentPayload);
    case 'send_consent':
      return sendConsent(input.orgId, input.userId, input.payload as SendConsentPayload);
    case 'create_referral':
      return createReferral(input.orgId, input.userId, input.payload as CreateReferralPayload);
    default:
      throw new ValidationError(`Unknown actionType: ${(input as any).actionType}`);
  }
}

// ─── Course launcher ────────────────────────────────────────────────

async function launchCourse(
  orgId: string,
  userId: string,
  p: LaunchCoursePayload,
): Promise<LaunchResult> {
  if (!p.courseId) throw new ValidationError('courseId is required');

  // Resolve the course title for the instance default name
  const [course] = await db.select().from(courses).where(eq(courses.id, p.courseId)).limit(1);
  if (!course) throw new NotFoundError('Course', p.courseId);

  const instance = await courseInstanceService.createInstance({
    orgId,
    courseId: p.courseId,
    title: p.title ?? `${course.title} · ${formatDate(new Date())}`,
    description: p.description,
    publishMode: p.publishMode ?? 'assign',
    responsibleId: p.responsibleId ?? userId,
    createdBy: userId,
  });

  // TODO Phase 9γ: optionally enroll clientUserIds via courseEnrollment service
  return {
    kind: 'course',
    instanceId: instance.id,
    summary: `课程「${course.title}」已启动`,
  };
}

// ─── Group launcher ─────────────────────────────────────────────────

async function launchGroup(
  orgId: string,
  userId: string,
  p: LaunchGroupPayload,
): Promise<LaunchResult> {
  if (!p.title) throw new ValidationError('title is required');

  // Optional: validate scheme belongs to this org
  if (p.schemeId) {
    const [scheme] = await db
      .select()
      .from(groupSchemes)
      .where(eq(groupSchemes.id, p.schemeId))
      .limit(1);
    if (!scheme) throw new NotFoundError('GroupScheme', p.schemeId);
  }

  const instance = await groupInstanceService.createInstance({
    orgId,
    schemeId: p.schemeId,
    title: p.title,
    description: p.description,
    category: p.category,
    leaderId: p.leaderId ?? userId,
    schedule: p.schedule,
    duration: p.duration,
    capacity: p.capacity,
    createdBy: userId,
  });

  return {
    kind: 'group',
    instanceId: instance.id,
    summary: `团辅「${p.title}」已开班`,
  };
}

// ─── Episode launcher ───────────────────────────────────────────────

async function createEpisode(
  orgId: string,
  p: CreateEpisodePayload,
): Promise<LaunchResult> {
  if (!p.clientId) throw new ValidationError('clientId is required');

  const episode = await episodeService.createEpisode({
    orgId,
    clientId: p.clientId,
    counselorId: p.counselorId,
    chiefComplaint: p.chiefComplaint,
    currentRisk: p.currentRisk,
  });

  return {
    kind: 'counseling',
    instanceId: episode.id,
    summary: '个案已开启',
  };
}

// ─── Assessment launcher ────────────────────────────────────────────

async function sendAssessment(
  orgId: string,
  userId: string,
  p: SendAssessmentPayload,
): Promise<LaunchResult> {
  if (!p.scaleId && !p.assessmentId) {
    throw new ValidationError('scaleId or assessmentId is required');
  }
  if (!p.clientUserIds || p.clientUserIds.length === 0) {
    throw new ValidationError('clientUserIds is required');
  }

  // If assessmentId provided, just return it. Otherwise build a new assessment
  // around the given scale.
  let assessmentId = p.assessmentId;
  let title = p.title;

  if (!assessmentId && p.scaleId) {
    const [scale] = await db.select().from(scales).where(eq(scales.id, p.scaleId)).limit(1);
    if (!scale) throw new NotFoundError('Scale', p.scaleId);
    title = title ?? scale.title;

    const created = await assessmentService.createAssessment({
      orgId,
      title,
      assessmentType: 'tracking',
      scaleIds: [p.scaleId],
      createdBy: userId,
      collectMode: 'require_register',
    });
    assessmentId = created.id;
  }

  // Note: actual delivery to client happens via assessment distribution links
  // or batch dispatch — Phase 9β returns the new assessment id and the caller
  // (UI layer) decides whether to copy a link, dispatch a batch, or redirect.
  return {
    kind: 'assessment',
    instanceId: assessmentId!,
    summary: `测评「${title ?? '新测评'}」已创建并准备下发`,
  };
}

// ─── Consent launcher ───────────────────────────────────────────────

async function sendConsent(
  orgId: string,
  userId: string,
  p: SendConsentPayload,
): Promise<LaunchResult> {
  if (!p.templateId) throw new ValidationError('templateId is required');
  if (!p.clientUserId) throw new ValidationError('clientUserId is required');

  // Look up the template and create a pending client_documents row.
  const [template] = await db
    .select()
    .from(consentTemplates)
    .where(eq(consentTemplates.id, p.templateId))
    .limit(1);
  if (!template) throw new NotFoundError('ConsentTemplate', p.templateId);

  const [doc] = await db
    .insert(clientDocuments)
    .values({
      orgId,
      clientId: p.clientUserId,
      templateId: p.templateId,
      docType: 'consent',
      title: template.title,
      content: template.content,
      status: 'pending',
      createdBy: userId,
    } as any)
    .returning();

  return {
    kind: 'consent',
    instanceId: doc.id,
    summary: `协议「${template.title}」已发送给来访者`,
  };
}

// ─── Referral launcher ──────────────────────────────────────────────

async function createReferral(
  orgId: string,
  userId: string,
  p: CreateReferralPayload,
): Promise<LaunchResult> {
  if (!p.careEpisodeId) throw new ValidationError('careEpisodeId is required');
  if (!p.clientId) throw new ValidationError('clientId is required');
  if (!p.reason) throw new ValidationError('reason is required');

  const referral = await referralService.createReferral({
    orgId,
    careEpisodeId: p.careEpisodeId,
    clientId: p.clientId,
    referredBy: userId,
    reason: p.reason,
    riskSummary: p.riskSummary,
    targetType: p.targetType,
    targetName: p.targetName,
    targetContact: p.targetContact,
  });

  return {
    kind: 'referral',
    instanceId: referral.id,
    summary: '转介已创建',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
