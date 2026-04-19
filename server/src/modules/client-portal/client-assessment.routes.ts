import type { FastifyInstance } from 'fastify';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { assessmentResults } from '../../db/schema.js';
import { rejectAsParam } from './client-portal-shared.js';

/**
 * Assessment results (read-only from the client side).
 *
 * Phase 9β: only counselor-opted-in results are visible.
 * Phase 14: guardians cannot see results at all — `?as=` refused.
 */
export async function clientAssessmentRoutes(app: FastifyInstance) {
  /** List my results — counselor-opted-in only */
  app.get('/results', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        eq(assessmentResults.clientVisible, true),
        isNull(assessmentResults.deletedAt),
      ))
      .orderBy(desc(assessmentResults.createdAt));
  });

  /** Single result detail. Owned by user only. 404 if counselor hasn't opted-in. */
  app.get('/results/:resultId', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { resultId } = request.params as { resultId: string };

    const [row] = await db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.id, resultId),
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        eq(assessmentResults.clientVisible, true),
        isNull(assessmentResults.deletedAt),
      ))
      .limit(1);

    if (!row) {
      throw new Error('Result not available');
    }
    return row;
  });

  /** Trajectory query for the calling user. Filtered by clientVisible in the service. */
  app.get('/results/trajectory/:scaleId', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { scaleId } = request.params as { scaleId: string };

    const { getTrajectory } = await import('../assessment/result.service.js');
    return getTrajectory(orgId, userId, scaleId, { onlyClientVisible: true });
  });
}
