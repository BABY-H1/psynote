/**
 * Portal-side "我的孩子" routes (auth required, runs as the holder).
 *
 * Mounted at /api/orgs/:orgId/client/children
 *
 * Guards: authGuard + orgContextGuard (no requireRole — clients use this)
 *
 * GET    /              — list active relationships I hold
 * DELETE /:relId        — revoke a relationship I hold
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { logAudit } from '../../middleware/audit.js';
import * as parentBindingService from './parent-binding.service.js';

export async function portalChildrenRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  app.get('/', async (request) => {
    return parentBindingService.listMyChildren(request.user!.id, request.org!.orgId);
  });

  app.delete('/:relId', async (request) => {
    const { relId } = request.params as { relId: string };
    const updated = await parentBindingService.revokeRelationship(request.user!.id, relId);
    await logAudit(request, 'update', 'client_relationships', relId);
    return updated;
  });
}
