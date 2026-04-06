import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import * as svc from './client-assignment.service.js';

export async function clientAssignmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // List assignments (counselors see own, admin sees all)
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;
    const counselorId = request.org!.role === 'org_admin' ? undefined : request.user!.id;
    return svc.listAssignments(orgId, counselorId);
  });

  // Create assignment (org_admin or counselor)
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { clientId, counselorId, isPrimary } = request.body as {
      clientId: string; counselorId?: string; isPrimary?: boolean;
    };
    const assignment = await svc.createAssignment({
      orgId: request.org!.orgId,
      clientId,
      counselorId: counselorId || request.user!.id,
      isPrimary,
    });
    return reply.status(201).send(assignment);
  });

  // Delete assignment (org_admin only)
  app.delete('/:assignmentId', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const { assignmentId } = request.params as { assignmentId: string };
    return svc.deleteAssignment(assignmentId);
  });
}
