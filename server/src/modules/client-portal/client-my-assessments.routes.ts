import type { FastifyInstance } from 'fastify';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  assessmentResults, assessments,
  groupInstances, groupEnrollments,
  courseInstances, courseEnrollments,
} from '../../db/schema.js';
import { rejectAsParam } from './client-portal-shared.js';

/**
 * Aggregate assessments the client needs to fill — derived from
 * `assessmentConfig` on each group/course instance they are enrolled in.
 *
 * Split out from the groups/courses module because the aggregation is a
 * chunky cross-table walk (group enrollments + course enrollments +
 * assessments + assessment_results) that merits its own file.
 */
export async function clientMyAssessmentsRoutes(app: FastifyInstance) {
  app.get('/my-assessments', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    // 1. Collect assessment configs from enrolled group instances.
    const groupRows = await db
      .select({
        instanceTitle: groupInstances.title,
        assessmentConfig: groupInstances.assessmentConfig,
        instanceType: sql<string>`'group'`,
      })
      .from(groupEnrollments)
      .innerJoin(groupInstances, eq(groupInstances.id, groupEnrollments.instanceId))
      .where(and(
        eq(groupEnrollments.userId, userId),
        eq(groupEnrollments.status, 'approved'),
        eq(groupInstances.orgId, orgId),
      ));

    // 2. Collect configs from enrolled course instances.
    const courseRows = await db
      .select({
        instanceTitle: courseInstances.title,
        assessmentConfig: courseInstances.assessmentConfig,
        instanceType: sql<string>`'course'`,
      })
      .from(courseEnrollments)
      .innerJoin(courseInstances, eq(courseInstances.id, courseEnrollments.instanceId))
      .where(and(
        eq(courseEnrollments.userId, userId),
        eq(courseInstances.orgId, orgId),
      ));

    // 3. Walk each config and collect unique assessment ids + their context.
    const assessmentIdSet = new Set<string>();
    const assessmentContextMap = new Map<string, { instanceTitle: string; phase: string }>();

    for (const row of [...groupRows, ...courseRows]) {
      const config = (row.assessmentConfig || {}) as Record<string, unknown>;
      const phases: [string, string[]][] = [
        ['screening', (config.screening as string[]) || []],
        ['preGroup', (config.preGroup as string[]) || []],
        ['postGroup', (config.postGroup as string[]) || []],
        ['satisfaction', (config.satisfaction as string[]) || []],
      ];
      const perSession = (config.perSession || {}) as Record<string, string[]>;
      for (const [, ids] of Object.entries(perSession)) {
        if (Array.isArray(ids)) phases.push(['perSession', ids]);
      }
      const followUp = (config.followUp || []) as Array<{ assessments: string[] }>;
      for (const round of followUp) {
        if (round.assessments) phases.push(['followUp', round.assessments]);
      }

      for (const [phase, ids] of phases) {
        for (const id of ids) {
          assessmentIdSet.add(id);
          if (!assessmentContextMap.has(id)) {
            assessmentContextMap.set(id, { instanceTitle: row.instanceTitle, phase });
          }
        }
      }
    }

    if (assessmentIdSet.size === 0) return [];

    // 4. Filter out legacy non-UUID strings, then fetch metadata.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assessmentIds = Array.from(assessmentIdSet).filter((id) => uuidRegex.test(id));
    if (assessmentIds.length === 0) return [];
    const assessmentRows = await db
      .select({ id: assessments.id, title: assessments.title, description: assessments.description })
      .from(assessments)
      .where(inArray(assessments.id, assessmentIds));

    // 5. Which ones has the user already completed?
    const resultRows = await db
      .select({ assessmentId: assessmentResults.assessmentId })
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.userId, userId),
        inArray(assessmentResults.assessmentId, assessmentIds),
      ));
    const completedSet = new Set(resultRows.map((r) => r.assessmentId));

    return assessmentRows.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      completed: completedSet.has(a.id),
      context: assessmentContextMap.get(a.id),
      runnerUrl: `/assess/${a.id}`,
    }));
  });
}
