import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { rejectClient } from '../../middleware/reject-client.js';
import { listPeople, getPersonArchive } from './person-archive.service.js';

/**
 * Phase 6 — Person archive routes.
 *
 *   GET /api/orgs/:orgId/people
 *     Returns: { items: PersonSummary[] }
 *     Query: ?limit (default 200, max 1000)
 *     Lists all users in the org who have at least one service touchpoint
 *     (counseling / group / course / assessment), sorted by most recent
 *     activity. Used by PeopleList.tsx.
 *
 *   GET /api/orgs/:orgId/people/:userId/archive
 *     Returns: PersonArchive — full cross-module history of one user.
 *     404 if the user doesn't exist.
 *
 * RBAC: org-scoped via orgContextGuard. Same caveat as the Phase 5b delivery
 * route — no per-counselor data scoping yet. Counselors can see archives for
 * any user with touchpoints in the org. Add dataScopeGuard if/when needed.
 */
export async function personArchiveRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  app.get('/people', async (request) => {
    const orgId = request.org!.orgId;
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : undefined;
    const items = await listPeople(orgId, limit);
    return { items };
  });

  app.get('/people/:userId/archive', async (request) => {
    const orgId = request.org!.orgId;
    const { userId } = request.params as { userId: string };
    return getPersonArchive(orgId, userId);
  });
}
