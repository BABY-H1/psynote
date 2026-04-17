/**
 * Counselor-side parent invitation routes.
 *
 * Mounted at /api/orgs/:orgId/school/classes/:classId/parent-invite-tokens
 *
 * Guards: authGuard + orgContextGuard + requireRole('counselor', 'org_admin')
 *
 * GET    /              — list active + revoked tokens for this class
 * POST   /              — generate a new token (default 30-day expiry)
 * DELETE /:tokenId      — revoke an existing token
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import * as parentBindingService from './parent-binding.service.js';

export async function parentInvitationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireRole('counselor', 'org_admin'));

  app.get('/', async (request) => {
    const { classId } = request.params as { classId: string };
    return parentBindingService.listClassTokens(request.org!.orgId, classId);
  });

  app.post('/', async (request, reply) => {
    const { classId } = request.params as { classId: string };
    const body = (request.body || {}) as { expiresInDays?: number };
    const created = await parentBindingService.createClassToken({
      orgId: request.org!.orgId,
      classId,
      createdBy: request.user!.id,
      expiresInDays: body.expiresInDays,
    });
    await logAudit(request, 'create', 'class_parent_invite_tokens', created.id);
    return reply.status(201).send(created);
  });

  app.delete('/:tokenId', async (request) => {
    const { tokenId } = request.params as { tokenId: string };
    const updated = await parentBindingService.revokeClassToken(request.org!.orgId, tokenId);
    await logAudit(request, 'update', 'class_parent_invite_tokens', tokenId);
    return updated;
  });
}
