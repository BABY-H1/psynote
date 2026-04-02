import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { referrals, careTimeline } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listReferrals(orgId: string, careEpisodeId?: string) {
  const conditions = [eq(referrals.orgId, orgId)];
  if (careEpisodeId) conditions.push(eq(referrals.careEpisodeId, careEpisodeId));

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
