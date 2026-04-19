import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import * as profileService from './client-profile.service.js';

export async function clientProfileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** Get client profile */
  app.get('/:userId/profile', async (request) => {
    const { userId } = request.params as { userId: string };
    await logPhiAccess(request, userId, 'client_profiles', 'view');
    return profileService.getProfile(request.org!.orgId, userId);
  });

  /** Create or update client profile */
  app.put(
    '/:userId/profile',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as Record<string, unknown>;

      const profile = await profileService.upsertProfile(
        request.org!.orgId,
        userId,
        body,
      );

      await logAudit(request, 'update', 'client_profiles', profile.id);
      return profile;
    },
  );

  /** Get client summary (profile + episodes + results) */
  app.get('/:userId/summary', async (request) => {
    const { userId } = request.params as { userId: string };
    await logPhiAccess(request, userId, 'client_profiles', 'view');
    return profileService.getClientSummary(request.org!.orgId, userId);
  });
}
