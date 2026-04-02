import { eq, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { distributions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listDistributions(assessmentId: string) {
  return db
    .select()
    .from(distributions)
    .where(eq(distributions.assessmentId, assessmentId))
    .orderBy(desc(distributions.createdAt));
}

export async function getDistributionById(distributionId: string) {
  const [dist] = await db
    .select()
    .from(distributions)
    .where(eq(distributions.id, distributionId))
    .limit(1);

  if (!dist) throw new NotFoundError('Distribution', distributionId);
  return dist;
}

export async function createDistribution(input: {
  orgId: string;
  assessmentId: string;
  mode?: string;
  batchLabel?: string;
  targets?: unknown[];
  schedule?: unknown;
  createdBy: string;
}) {
  const [dist] = await db.insert(distributions).values({
    orgId: input.orgId,
    assessmentId: input.assessmentId,
    mode: input.mode || 'public',
    batchLabel: input.batchLabel,
    targets: input.targets || [],
    schedule: input.schedule || {},
    createdBy: input.createdBy,
  }).returning();

  return dist;
}

export async function updateDistributionStatus(
  distributionId: string,
  status: string,
) {
  const [updated] = await db
    .update(distributions)
    .set({ status })
    .where(eq(distributions.id, distributionId))
    .returning();

  if (!updated) throw new NotFoundError('Distribution', distributionId);
  return updated;
}

export async function incrementCompleted(distributionId: string) {
  const dist = await getDistributionById(distributionId);
  const [updated] = await db
    .update(distributions)
    .set({ completedCount: dist.completedCount + 1 })
    .where(eq(distributions.id, distributionId))
    .returning();
  return updated;
}
