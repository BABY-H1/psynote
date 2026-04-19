/**
 * Shared helpers for the crisis-case domain — type aliases, DB-row
 * converters, and cross-module side-effect utilities (notifications).
 *
 * These are deliberately co-located with the crisis module (not promoted
 * to `lib/` or `shared/`) because they encode crisis-specific semantics
 * (step → timeline mapping, supervisor discovery policy).
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { crisisCases, orgMembers, notifications } from '../../db/schema.js';
import type {
  CrisisCase,
  CrisisChecklist,
  CrisisChecklistStepKey,
  CrisisCaseStage,
  ReinterviewStep,
  ParentContactStep,
  DocumentsStep,
  ReferralStep,
  FollowUpStep,
} from '@psynote/shared';
import { CRISIS_STEP_LABELS } from '@psynote/shared';

/** Union of all step payload variants the checklist accepts. */
export type StepPayload =
  | ReinterviewStep
  | ParentContactStep
  | DocumentsStep
  | ReferralStep
  | FollowUpStep;

/**
 * Build the timeline event title when a checklist step is updated.
 * Distinguishes "done" vs "skipped" vs "updated" for audit clarity.
 */
export function buildStepTimelineTitle(
  stepKey: CrisisChecklistStepKey,
  step: StepPayload,
): string {
  const label = CRISIS_STEP_LABELS[stepKey];
  if (step.skipped) return `${label}(已跳过)`;
  if (step.done) return `${label}已完成`;
  return `${label}已更新`;
}

/** Build the timeline event summary for a checklist-step update. */
export function buildStepTimelineSummary(
  stepKey: CrisisChecklistStepKey,
  step: StepPayload,
): string {
  if (step.skipped && step.skipReason) return `跳过原因: ${step.skipReason}`;
  if (stepKey === 'parentContact') {
    const p = step as ParentContactStep;
    const parts = [
      p.method && `方式: ${p.method}`,
      p.contactName && `对象: ${p.contactName}`,
      p.summary,
    ].filter(Boolean);
    return parts.join(' · ');
  }
  const anyStep = step as { summary?: string };
  return anyStep.summary || '';
}

/** Convert a raw `crisis_cases` DB row to the typed `CrisisCase` DTO. */
export function toCrisisCase(row: typeof crisisCases.$inferSelect): CrisisCase {
  return {
    id: row.id,
    orgId: row.orgId,
    episodeId: row.episodeId,
    candidateId: row.candidateId,
    stage: row.stage as CrisisCaseStage,
    checklist: (row.checklist || {}) as CrisisChecklist,
    closureSummary: row.closureSummary,
    supervisorNote: row.supervisorNote,
    signedOffBy: row.signedOffBy,
    signedOffAt: row.signedOffAt ? row.signedOffAt.toISOString() : null,
    submittedForSignOffAt: row.submittedForSignOffAt
      ? row.submittedForSignOffAt.toISOString()
      : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Fan-out supervisor notifications when a crisis case is submitted for
 * sign-off. There is no dedicated `supervisor` role in the system; the
 * supervisor function is performed by either `org_admin` users or
 * counselors with `fullPracticeAccess=true` (see data-scope.ts). We
 * broadcast to both groups — whoever sees it first in the notification
 * center handles the review.
 */
export async function notifySupervisors(
  orgId: string,
  notif: {
    type: string;
    title: string;
    body?: string;
    refType?: string;
    refId?: string;
  },
): Promise<void> {
  const candidates = await db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      fullPracticeAccess: orgMembers.fullPracticeAccess,
    })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, 'active')));

  const supervisors = candidates.filter(
    (m) => m.role === 'org_admin' || (m.role === 'counselor' && m.fullPracticeAccess),
  );
  if (supervisors.length === 0) return;

  await db.insert(notifications).values(
    supervisors.map((s) => ({
      orgId,
      userId: s.userId,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      refType: notif.refType,
      refId: notif.refId,
    })),
  );
}
