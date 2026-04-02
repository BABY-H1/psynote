import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { followUpPlans, followUpReviews, careTimeline, careEpisodes } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

// ─── Plans ───────────────────────────────────────────────────────

export async function listFollowUpPlans(orgId: string, careEpisodeId?: string) {
  const conditions = [eq(followUpPlans.orgId, orgId)];
  if (careEpisodeId) conditions.push(eq(followUpPlans.careEpisodeId, careEpisodeId));

  return db
    .select()
    .from(followUpPlans)
    .where(and(...conditions))
    .orderBy(desc(followUpPlans.createdAt));
}

export async function createFollowUpPlan(input: {
  orgId: string;
  careEpisodeId: string;
  counselorId: string;
  planType?: string;
  assessmentId?: string;
  frequency?: string;
  nextDue?: Date;
  notes?: string;
}) {
  const [plan] = await db.insert(followUpPlans).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId,
    counselorId: input.counselorId,
    planType: input.planType,
    assessmentId: input.assessmentId || null,
    frequency: input.frequency,
    nextDue: input.nextDue,
    notes: input.notes,
  }).returning();

  // Record in timeline
  await db.insert(careTimeline).values({
    careEpisodeId: input.careEpisodeId,
    eventType: 'follow_up_plan',
    refId: plan.id,
    title: '制定跟踪计划',
    summary: `类型: ${input.planType || '复评'} | 频率: ${input.frequency || '未设定'}`,
    metadata: { planType: input.planType, frequency: input.frequency },
    createdBy: input.counselorId,
  });

  return plan;
}

export async function updateFollowUpPlan(
  planId: string,
  updates: Partial<{
    frequency: string;
    nextDue: Date;
    status: string;
    notes: string;
  }>,
) {
  const [updated] = await db
    .update(followUpPlans)
    .set(updates)
    .where(eq(followUpPlans.id, planId))
    .returning();

  if (!updated) throw new NotFoundError('FollowUpPlan', planId);
  return updated;
}

// ─── Reviews ─────────────────────────────────────────────────────

export async function listFollowUpReviews(careEpisodeId: string) {
  return db
    .select()
    .from(followUpReviews)
    .where(eq(followUpReviews.careEpisodeId, careEpisodeId))
    .orderBy(desc(followUpReviews.reviewDate));
}

export async function createFollowUpReview(input: {
  planId: string;
  careEpisodeId: string;
  counselorId: string;
  resultId?: string;
  riskBefore?: string;
  riskAfter?: string;
  clinicalNote?: string;
  decision?: string;
}) {
  const [review] = await db.insert(followUpReviews).values({
    planId: input.planId,
    careEpisodeId: input.careEpisodeId,
    counselorId: input.counselorId,
    resultId: input.resultId || null,
    riskBefore: input.riskBefore,
    riskAfter: input.riskAfter,
    clinicalNote: input.clinicalNote,
    decision: input.decision,
  }).returning();

  // Update episode risk if changed
  if (input.riskAfter && input.riskAfter !== input.riskBefore) {
    await db
      .update(careEpisodes)
      .set({ currentRisk: input.riskAfter, updatedAt: new Date() })
      .where(eq(careEpisodes.id, input.careEpisodeId));

    // Record risk change in timeline
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'risk_change',
      refId: review.id,
      title: '风险等级变更',
      summary: `${input.riskBefore} → ${input.riskAfter}`,
      metadata: { riskBefore: input.riskBefore, riskAfter: input.riskAfter },
      createdBy: input.counselorId,
    });
  }

  // Record review in timeline
  const decisionLabels: Record<string, string> = {
    continue: '继续当前干预',
    escalate: '升级干预',
    deescalate: '降级干预',
    close: '结案',
  };

  await db.insert(careTimeline).values({
    careEpisodeId: input.careEpisodeId,
    eventType: 'follow_up_review',
    refId: review.id,
    title: '跟踪复评',
    summary: `决定: ${decisionLabels[input.decision || ''] || input.decision || '待定'}`,
    metadata: { decision: input.decision, clinicalNote: input.clinicalNote },
    createdBy: input.counselorId,
  });

  // Close episode if decision is 'close'
  if (input.decision === 'close') {
    await db
      .update(careEpisodes)
      .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(careEpisodes.id, input.careEpisodeId));
  }

  return review;
}
