import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { treatmentPlans, careTimeline } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listPlans(orgId: string, careEpisodeId: string) {
  return db
    .select()
    .from(treatmentPlans)
    .where(
      and(
        eq(treatmentPlans.orgId, orgId),
        eq(treatmentPlans.careEpisodeId, careEpisodeId),
      ),
    )
    .orderBy(desc(treatmentPlans.updatedAt));
}

export async function getPlan(planId: string) {
  const [plan] = await db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.id, planId))
    .limit(1);

  if (!plan) throw new NotFoundError('TreatmentPlan', planId);
  return plan;
}

export async function createPlan(input: {
  orgId: string;
  careEpisodeId: string;
  counselorId: string;
  title?: string;
  approach?: string;
  goals?: unknown[];
  interventions?: unknown[];
  sessionPlan?: string;
  progressNotes?: string;
  reviewDate?: string;
  status?: string;
}) {
  const [plan] = await db
    .insert(treatmentPlans)
    .values({
      orgId: input.orgId,
      careEpisodeId: input.careEpisodeId,
      counselorId: input.counselorId,
      title: input.title,
      approach: input.approach,
      goals: input.goals || [],
      interventions: input.interventions || [],
      sessionPlan: input.sessionPlan,
      progressNotes: input.progressNotes,
      reviewDate: input.reviewDate,
      status: input.status || 'draft',
    })
    .returning();

  // Timeline event
  await db.insert(careTimeline).values({
    careEpisodeId: input.careEpisodeId,
    eventType: 'treatment_plan',
    refId: plan.id,
    title: '制定治疗计划',
    summary: input.title || '新治疗计划',
    metadata: {
      approach: input.approach,
      goalCount: (input.goals || []).length,
    },
    createdBy: input.counselorId,
  });

  return plan;
}

export async function updatePlan(
  planId: string,
  updates: {
    title?: string;
    approach?: string;
    goals?: unknown[];
    interventions?: unknown[];
    sessionPlan?: string;
    progressNotes?: string;
    reviewDate?: string;
    status?: string;
  },
) {
  const [updated] = await db
    .update(treatmentPlans)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(treatmentPlans.id, planId))
    .returning();

  if (!updated) throw new NotFoundError('TreatmentPlan', planId);
  return updated;
}

export async function updateGoalStatus(
  planId: string,
  goalId: string,
  status: string,
) {
  const plan = await getPlan(planId);
  const goals = (plan.goals as { id: string; status: string }[]) || [];
  const goalIndex = goals.findIndex((g) => g.id === goalId);
  if (goalIndex === -1) throw new NotFoundError('TreatmentGoal', goalId);

  goals[goalIndex].status = status;

  const [updated] = await db
    .update(treatmentPlans)
    .set({ goals, updatedAt: new Date() })
    .where(eq(treatmentPlans.id, planId))
    .returning();

  return updated;
}
