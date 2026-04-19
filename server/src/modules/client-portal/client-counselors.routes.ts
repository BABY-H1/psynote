import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users, orgMembers, clientAssignments } from '../../db/schema.js';
import { resolveTargetUserId } from './client-portal-shared.js';

/**
 * Counselor directory for appointment booking. Guardian-readable so a
 * parent can see their child's assigned counselor when reviewing
 * appointment history on behalf of the child.
 *
 * Sort: the calling user's assigned primary counselor bubbles to the top,
 * followed by everyone else in their original order.
 */
export async function clientCounselorsRoutes(app: FastifyInstance) {
  app.get('/counselors', async (request) => {
    const orgId = request.org!.orgId;
    const clientUserId = await resolveTargetUserId(request);

    const counselors = await db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        specialties: orgMembers.specialties,
        bio: orgMembers.bio,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, 'counselor'),
        eq(orgMembers.status, 'active'),
      ));

    const [assignment] = await db
      .select({ counselorId: clientAssignments.counselorId })
      .from(clientAssignments)
      .where(and(
        eq(clientAssignments.orgId, orgId),
        eq(clientAssignments.clientId, clientUserId),
        eq(clientAssignments.isPrimary, true),
      ))
      .limit(1);

    const myCounselorId = assignment?.counselorId;

    return counselors
      .map((c) => ({ ...c, isMyCounselor: c.id === myCounselorId }))
      .sort((a, b) => {
        if (a.isMyCounselor && !b.isMyCounselor) return -1;
        if (!a.isMyCounselor && b.isMyCounselor) return 1;
        return 0;
      });
  });
}
