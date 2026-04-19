/**
 * Crisis case workflow state machine — Phase 13.
 *
 *   candidate accept → createFromCandidate()
 *     creates care_episode + crisis_case + timeline event
 *
 *   counselor ticks a step → updateChecklistStep()
 *     merges step into `checklist` jsonb + writes timeline event
 *
 *   counselor done → submitForSignOff()
 *     stage='pending_sign_off', notifies supervisors
 *
 *   supervisor approves → signOff(approve=true)
 *     stage='closed', closes the care_episode too
 *
 *   supervisor bounces → signOff(approve=false)
 *     stage='reopened', counselor can resubmit
 *
 * Design note: no external communication from here — every "contact" step
 * is pure record-keeping; the counselor handles the actual communication
 * offline (phone/WeChat/face-to-face).
 *
 * Read-only lookups live in `./crisis-case.queries.ts`.
 * Analytics live in `./crisis-dashboard.service.ts`.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  crisisCases,
  careEpisodes,
  careTimeline,
  candidatePool,
  notifications,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type {
  CrisisCase,
  CrisisChecklist,
  CrisisChecklistStepKey,
} from '@psynote/shared';
import { CRISIS_REQUIRED_STEPS, CRISIS_STEP_LABELS } from '@psynote/shared';
import {
  toCrisisCase,
  notifySupervisors,
  buildStepTimelineTitle,
  buildStepTimelineSummary,
  type StepPayload,
} from './crisis-helpers.js';
import { getCaseById } from './crisis-case.queries.js';

/**
 * Atomically create a care_episode + crisis_case from an accepted candidate.
 * Called from workflow.routes.ts when a crisis_candidate is accepted.
 */
export async function createFromCandidate(input: {
  orgId: string;
  candidateId: string;
  acceptorUserId: string;
}): Promise<{ episodeId: string; crisisCaseId: string }> {
  const [cand] = await db
    .select()
    .from(candidatePool)
    .where(and(
      eq(candidatePool.id, input.candidateId),
      eq(candidatePool.orgId, input.orgId),
    ))
    .limit(1);
  if (!cand) throw new NotFoundError('Candidate', input.candidateId);
  if (cand.kind !== 'crisis_candidate') {
    throw new ValidationError('仅 crisis_candidate 可以创建危机案件');
  }
  if (cand.status !== 'pending') {
    throw new ValidationError(`候选已被处理(status=${cand.status})`);
  }

  const [episode] = await db.insert(careEpisodes).values({
    orgId: input.orgId,
    clientId: cand.clientUserId,
    counselorId: input.acceptorUserId,
    chiefComplaint: cand.suggestion,
    currentRisk: 'level_4',
    interventionType: 'crisis',
    status: 'active',
  }).returning();

  const [crisis] = await db.insert(crisisCases).values({
    orgId: input.orgId,
    episodeId: episode.id,
    candidateId: cand.id,
    stage: 'open',
    checklist: {},
    createdBy: input.acceptorUserId,
  }).returning();

  await db.insert(careTimeline).values({
    careEpisodeId: episode.id,
    eventType: 'crisis_opened',
    refId: crisis.id,
    title: '危机处置案件已开启',
    summary: cand.reason || '由规则引擎识别为危机候选,咨询师接手处置',
    metadata: {
      candidateId: cand.id,
      sourceRuleId: cand.sourceRuleId,
      priority: cand.priority,
    },
    createdBy: input.acceptorUserId,
  });

  return { episodeId: episode.id, crisisCaseId: crisis.id };
}

/** Merge a single checklist step update and emit a timeline breadcrumb. */
export async function updateChecklistStep(input: {
  orgId: string;
  caseId: string;
  stepKey: CrisisChecklistStepKey;
  payload: StepPayload;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage === 'closed') {
    throw new ValidationError('案件已结案,无法再修改清单');
  }

  const merged: CrisisChecklist = { ...existing.checklist };
  const nextStep: StepPayload = {
    ...(merged as Record<string, StepPayload | undefined>)[input.stepKey],
    ...input.payload,
    completedAt:
      input.payload.completedAt ?? (input.payload.done ? new Date().toISOString() : null),
  } as StepPayload;
  (merged as Record<string, StepPayload>)[input.stepKey] = nextStep;

  const [updated] = await db
    .update(crisisCases)
    .set({ checklist: merged, updatedAt: new Date() })
    .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
    .returning();

  await db.insert(careTimeline).values({
    careEpisodeId: existing.episodeId,
    eventType: `crisis_step_${input.stepKey}`,
    refId: input.caseId,
    title: buildStepTimelineTitle(input.stepKey, nextStep),
    summary: buildStepTimelineSummary(input.stepKey, nextStep),
    metadata: { stepKey: input.stepKey, payload: input.payload },
    createdBy: input.userId,
  });

  return toCrisisCase(updated);
}

/**
 * Transition case to `pending_sign_off`, validating required steps and
 * fan-out notifications to supervisors.
 */
export async function submitForSignOff(input: {
  orgId: string;
  caseId: string;
  closureSummary: string;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage === 'closed') throw new ValidationError('案件已结案');
  if (existing.stage === 'pending_sign_off') {
    throw new ValidationError('案件已提交,等待督导审核');
  }

  const missing = CRISIS_REQUIRED_STEPS.filter((k) => {
    const s = existing.checklist[k];
    return !s || !s.done;
  });
  if (missing.length > 0) {
    throw new ValidationError(
      `以下必做步骤未完成: ${missing.map((k) => CRISIS_STEP_LABELS[k]).join('、')}`,
    );
  }
  if (!input.closureSummary?.trim()) {
    throw new ValidationError('请填写结案摘要');
  }

  const now = new Date();
  const [updated] = await db
    .update(crisisCases)
    .set({
      stage: 'pending_sign_off',
      closureSummary: input.closureSummary.trim(),
      submittedForSignOffAt: now,
      updatedAt: now,
    })
    .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
    .returning();

  await db.insert(careTimeline).values({
    careEpisodeId: existing.episodeId,
    eventType: 'crisis_submitted_for_sign_off',
    refId: input.caseId,
    title: '已提交督导审核',
    summary: input.closureSummary.trim(),
    createdBy: input.userId,
  });

  await notifySupervisors(input.orgId, {
    type: 'crisis_sign_off_request',
    title: '危机案件等待您审核',
    body: input.closureSummary.trim().slice(0, 120),
    refType: 'crisis_case',
    refId: input.caseId,
  });

  return toCrisisCase(updated);
}

/**
 * Supervisor approves or bounces a submission. Approval closes both the
 * crisis case AND the underlying care_episode; bounce returns the case to
 * `reopened` so the counselor can iterate.
 */
export async function signOff(input: {
  orgId: string;
  caseId: string;
  approve: boolean;
  supervisorNote?: string;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage !== 'pending_sign_off') {
    throw new ValidationError(
      `只有 pending_sign_off 状态的案件可以审核(当前: ${existing.stage})`,
    );
  }

  const now = new Date();

  if (input.approve) {
    const [updated] = await db
      .update(crisisCases)
      .set({
        stage: 'closed',
        signedOffBy: input.userId,
        signedOffAt: now,
        supervisorNote: input.supervisorNote || null,
        updatedAt: now,
      })
      .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
      .returning();

    await db
      .update(careEpisodes)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(careEpisodes.id, existing.episodeId));

    await db.insert(careTimeline).values({
      careEpisodeId: existing.episodeId,
      eventType: 'crisis_signed_off',
      refId: input.caseId,
      title: '督导已确认结案',
      summary: input.supervisorNote || '',
      createdBy: input.userId,
    });

    if (existing.createdBy) {
      await db.insert(notifications).values({
        orgId: input.orgId,
        userId: existing.createdBy,
        type: 'crisis_signed_off',
        title: '危机案件已结案',
        body: '督导已确认您提交的危机处置案件结案。',
        refType: 'crisis_case',
        refId: input.caseId,
      });
    }

    return toCrisisCase(updated);
  }

  // Bounce back to counselor
  const [updated] = await db
    .update(crisisCases)
    .set({
      stage: 'reopened',
      supervisorNote: input.supervisorNote || null,
      submittedForSignOffAt: null,
      updatedAt: now,
    })
    .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
    .returning();

  await db.insert(careTimeline).values({
    careEpisodeId: existing.episodeId,
    eventType: 'crisis_reopened',
    refId: input.caseId,
    title: '督导退回修改',
    summary: input.supervisorNote || '',
    createdBy: input.userId,
  });

  if (existing.createdBy) {
    await db.insert(notifications).values({
      orgId: input.orgId,
      userId: existing.createdBy,
      type: 'crisis_reopened',
      title: '危机案件已退回修改',
      body: input.supervisorNote?.slice(0, 120) || '请根据督导反馈修改后重新提交。',
      refType: 'crisis_case',
      refId: input.caseId,
    });
  }

  return toCrisisCase(updated);
}
