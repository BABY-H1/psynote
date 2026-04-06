import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import * as svc from './client-access-grant.service.js';

export async function clientAccessGrantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // List active grants
  app.get('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const counselorId = request.org!.role === 'org_admin' ? undefined : request.user!.id;
    return svc.listActiveGrants(orgId, counselorId);
  });

  // Create grant
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { clientId, grantedToCounselorId, reason, expiresAt } = request.body as {
      clientId: string; grantedToCounselorId: string; reason: string; expiresAt?: string;
    };
    const grant = await svc.createGrant({
      orgId: request.org!.orgId,
      clientId,
      grantedToCounselorId,
      grantedBy: request.user!.id,
      reason,
      expiresAt,
    });
    return reply.status(201).send(grant);
  });

  // Revoke grant
  app.delete('/:grantId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { grantId } = request.params as { grantId: string };
    return svc.revokeGrant(grantId);
  });
}
