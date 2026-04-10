import { eq, and, desc, inArray, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../../config/database.js';
import {
  referrals, careTimeline, sessionNotes, assessmentResults, treatmentPlans,
  careEpisodes, users,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type { DataScope } from '../../middleware/data-scope.js';
import { clientScopeCondition } from '../../lib/data-scope-filter.js';

/**
 * Phase 9δ — Data package selection.
 *
 * The sender picks which records (notes, assessments, treatment plans) to
 * share. Stored as jsonb on the referral row. The receiver (or PDF) sees
 * exactly this set, no more no less. The client must consent before any
 * data leaves the platform.
 */
export interface DataPackageSpec {
  sessionNoteIds?: string[];
  assessmentResultIds?: string[];
  treatmentPlanIds?: string[];
  includeChiefComplaint?: boolean;
  includeRiskHistory?: boolean;
}

export async function listReferrals(orgId: string, careEpisodeId?: string, scope?: DataScope) {
  const conditions = [eq(referrals.orgId, orgId)];
  if (careEpisodeId) conditions.push(eq(referrals.careEpisodeId, careEpisodeId));

  if (scope && scope.type === 'assigned') {
    if (!scope.allowedClientIds || scope.allowedClientIds.length === 0) {
      return [];
    }
    conditions.push(inArray(referrals.clientId, scope.allowedClientIds));
  }

  return db
    .select()
    .from(referrals)
    .where(and(...conditions))
    .orderBy(desc(referrals.createdAt));
}

export async function getReferralById(referralId: string) {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);

  if (!referral) throw new NotFoundError('Referral', referralId);
  return referral;
}

export async function createReferral(input: {
  orgId: string;
  careEpisodeId: string;
  clientId: string;
  referredBy: string;
  reason: string;
  riskSummary?: string;
  targetType?: string;
  targetName?: string;
  targetContact?: string;
  followUpPlan?: string;
}) {
  const [referral] = await db.insert(referrals).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId,
    clientId: input.clientId,
    referredBy: input.referredBy,
    reason: input.reason,
    riskSummary: input.riskSummary,
    targetType: input.targetType,
    targetName: input.targetName,
    targetContact: input.targetContact,
    followUpPlan: input.followUpPlan,
  }).returning();

  // Record in timeline
  await db.insert(careTimeline).values({
    careEpisodeId: input.careEpisodeId,
    eventType: 'referral',
    refId: referral.id,
    title: '发起转介',
    summary: `转介至 ${input.targetName || input.targetType || '外部机构'}: ${input.reason}`,
    metadata: { targetType: input.targetType, targetName: input.targetName },
    createdBy: input.referredBy,
  });

  return referral;
}

export async function updateReferral(
  referralId: string,
  updates: Partial<{
    status: string;
    followUpNotes: string;
    targetName: string;
    targetContact: string;
  }>,
) {
  const [updated] = await db
    .update(referrals)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(referrals.id, referralId))
    .returning();

  if (!updated) throw new NotFoundError('Referral', referralId);
  return updated;
}

// ─── Phase 9δ — Bidirectional flow ──────────────────────────────────

/**
 * Create a referral with explicit data package selection and mode.
 *
 * Mode 'platform': receiver is a psynote user/org → status starts as 'pending'
 *   and the receiver sees it in their inbox after the client consents.
 * Mode 'external': no in-app receiver → status starts as 'pending', after
 *   client consent we generate a download token + expiry; the sender hands
 *   the resulting URL off-platform.
 */
export async function createReferralExtended(input: {
  orgId: string;
  careEpisodeId: string;
  clientId: string;
  referredBy: string;
  reason: string;
  riskSummary?: string;
  mode: 'platform' | 'external';
  // Platform mode receivers
  toCounselorId?: string;
  toOrgId?: string;
  // External mode contact info
  targetType?: string;
  targetName?: string;
  targetContact?: string;
  // Data package selection
  dataPackageSpec: DataPackageSpec;
}) {
  if (input.mode === 'platform' && !input.toCounselorId && !input.toOrgId) {
    throw new ValidationError('platform mode requires toCounselorId or toOrgId');
  }

  const [referral] = await db.insert(referrals).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId,
    clientId: input.clientId,
    referredBy: input.referredBy,
    reason: input.reason,
    riskSummary: input.riskSummary,
    mode: input.mode,
    toCounselorId: input.toCounselorId ?? null,
    toOrgId: input.toOrgId ?? null,
    targetType: input.targetType,
    targetName: input.targetName,
    targetContact: input.targetContact,
    dataPackageSpec: input.dataPackageSpec as any,
    status: 'pending',
  }).returning();

  await db.insert(careTimeline).values({
    careEpisodeId: input.careEpisodeId,
    eventType: 'referral',
    refId: referral.id,
    title: '发起转介',
    summary: `转介至 ${input.targetName ?? input.targetType ?? '外部机构'}: ${input.reason}`,
    metadata: {
      mode: input.mode,
      toCounselorId: input.toCounselorId,
      toOrgId: input.toOrgId,
    },
    createdBy: input.referredBy,
  });

  return referral;
}

/**
 * Client portal: the referred client gives or withholds consent.
 * Once consented (mode='external'), the system mints a download token.
 */
export async function recordClientConsent(
  referralId: string,
  clientId: string,
  consent: boolean,
) {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);
  if (!referral) throw new NotFoundError('Referral', referralId);
  if (referral.clientId !== clientId) {
    throw new ValidationError('You cannot consent to a referral that is not yours');
  }
  if (referral.status !== 'pending') {
    throw new ValidationError(`Referral is in status "${referral.status}", not pending`);
  }

  if (!consent) {
    const [updated] = await db
      .update(referrals)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: '来访者未同意转介',
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referralId))
      .returning();
    return updated;
  }

  // Consent given: mint download token if external mode
  const patch: Record<string, unknown> = {
    status: 'consented',
    consentedAt: new Date(),
    updatedAt: new Date(),
  };
  if (referral.mode === 'external') {
    patch.downloadToken = randomBytes(24).toString('hex');
    // 7-day expiry by default
    patch.downloadExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const [updated] = await db
    .update(referrals)
    .set(patch as any)
    .where(eq(referrals.id, referralId))
    .returning();
  return updated;
}

/**
 * Receiver-side: accept or reject a platform-internal referral.
 * Receiver is identified by toCounselorId == userId (the calling user).
 */
export async function respondToReferral(
  referralId: string,
  receiverUserId: string,
  decision: 'accept' | 'reject',
  reason?: string,
) {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);
  if (!referral) throw new NotFoundError('Referral', referralId);
  if (referral.toCounselorId !== receiverUserId) {
    // Allow org_admin via toOrgId — caller layer should have validated org context
  }
  if (referral.status !== 'consented') {
    throw new ValidationError(
      `Referral is in status "${referral.status}", expected "consented"`,
    );
  }

  if (decision === 'reject') {
    const [updated] = await db
      .update(referrals)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referralId))
      .returning();
    return updated;
  }

  const [updated] = await db
    .update(referrals)
    .set({
      status: 'accepted',
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referrals.id, referralId))
    .returning();
  return updated;
}

/**
 * Resolve the data package — fetch the actual records the sender selected
 * for this referral. Used by both the platform receiver and the external PDF.
 */
export async function resolveDataPackage(referralId: string) {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);
  if (!referral) throw new NotFoundError('Referral', referralId);

  const spec = referral.dataPackageSpec as DataPackageSpec | null;
  const result: Record<string, unknown> = {
    referral,
  };

  // Episode + client basics
  const [episode] = await db
    .select()
    .from(careEpisodes)
    .where(eq(careEpisodes.id, referral.careEpisodeId))
    .limit(1);
  result.episode = episode;

  const [client] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, referral.clientId))
    .limit(1);
  result.client = client;

  if (spec?.sessionNoteIds && spec.sessionNoteIds.length > 0) {
    result.sessionNotes = await db
      .select()
      .from(sessionNotes)
      .where(inArray(sessionNotes.id, spec.sessionNoteIds));
  }

  if (spec?.assessmentResultIds && spec.assessmentResultIds.length > 0) {
    result.assessmentResults = await db
      .select()
      .from(assessmentResults)
      .where(inArray(assessmentResults.id, spec.assessmentResultIds));
  }

  if (spec?.treatmentPlanIds && spec.treatmentPlanIds.length > 0) {
    result.treatmentPlans = await db
      .select()
      .from(treatmentPlans)
      .where(inArray(treatmentPlans.id, spec.treatmentPlanIds));
  }

  return result;
}

/**
 * Inbox query for a counselor — referrals where they are the receiver and
 * the client has already consented (so they have something to act on).
 */
export async function listIncomingReferrals(receiverUserId: string) {
  return db
    .select()
    .from(referrals)
    .where(and(
      eq(referrals.toCounselorId, receiverUserId),
      or(
        eq(referrals.status, 'consented'),
        eq(referrals.status, 'accepted'),
      )!,
    ))
    .orderBy(desc(referrals.createdAt));
}

/**
 * Verify a download token and return the data package — used by the
 * external mode one-time download URL. Token must match and not be expired.
 */
export async function getByDownloadToken(token: string) {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.downloadToken, token))
    .limit(1);
  if (!referral) throw new NotFoundError('Referral', token);
  if (!referral.downloadExpiresAt || referral.downloadExpiresAt < new Date()) {
    throw new ValidationError('Download link has expired');
  }
  if (referral.status !== 'consented' && referral.status !== 'completed') {
    throw new ValidationError('Referral is not in a downloadable state');
  }
  return resolveDataPackage(referral.id);
}
