import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { assessmentBatches, assessmentResults } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listBatches(orgId: string) {
  return db
    .select()
    .from(assessmentBatches)
    .where(eq(assessmentBatches.orgId, orgId))
    .orderBy(desc(assessmentBatches.createdAt));
}

export async function getBatchById(batchId: string) {
  const [batch] = await db
    .select()
    .from(assessmentBatches)
    .where(eq(assessmentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError('AssessmentBatch', batchId);

  // Compute live stats
  const results = await db
    .select()
    .from(assessmentResults)
    .where(eq(assessmentResults.batchId, batchId));

  const riskDistribution: Record<string, number> = {};
  for (const r of results) {
    const level = r.riskLevel || 'unknown';
    riskDistribution[level] = (riskDistribution[level] || 0) + 1;
  }

  return {
    ...batch,
    stats: {
      total: (batch.stats as Record<string, unknown>)?.total || 0,
      completed: results.length,
      riskDistribution,
    },
  };
}

export async function createBatch(input: {
  orgId: string;
  assessmentId: string;
  title: string;
  targetType?: string;
  targetConfig?: Record<string, unknown>;
  deadline?: Date;
  totalTargets: number;
  createdBy: string;
}) {
  const [batch] = await db.insert(assessmentBatches).values({
    orgId: input.orgId,
    assessmentId: input.assessmentId,
    title: input.title,
    targetType: input.targetType,
    targetConfig: input.targetConfig || {},
    deadline: input.deadline,
    status: 'active',
    stats: { total: input.totalTargets },
    createdBy: input.createdBy,
  }).returning();

  return batch;
}

export async function updateBatchStatus(batchId: string, status: string) {
  const [updated] = await db
    .update(assessmentBatches)
    .set({ status })
    .where(eq(assessmentBatches.id, batchId))
    .returning();

  if (!updated) throw new NotFoundError('AssessmentBatch', batchId);
  return updated;
}
