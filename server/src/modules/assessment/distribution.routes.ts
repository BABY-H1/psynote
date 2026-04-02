import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as distributionService from './distribution.service.js';

export async function distributionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List distributions for an assessment */
  app.get('/', async (request) => {
    const { assessmentId } = request.params as { assessmentId: string };
    return distributionService.listDistributions(assessmentId);
  });

  /** Create a new distribution */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const body = request.body as {
      mode?: string;
      batchLabel?: string;
      targets?: unknown[];
      schedule?: unknown;
    };

    const dist = await distributionService.createDistribution({
      orgId: request.org!.orgId,
      assessmentId,
      mode: body.mode,
      batchLabel: body.batchLabel,
      targets: body.targets,
      schedule: body.schedule,
      createdBy: request.user!.id,
    });

    await logAudit(request, 'create', 'distributions', dist.id);
    return reply.status(201).send(dist);
  });

  /** Update distribution status */
  app.patch('/:distributionId/status', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { distributionId } = request.params as { distributionId: string };
    const body = request.body as { status: string };

    if (!body.status) throw new ValidationError('status is required');

    const updated = await distributionService.updateDistributionStatus(distributionId, body.status);
    await logAudit(request, 'update', 'distributions', distributionId);
    return updated;
  });
}
