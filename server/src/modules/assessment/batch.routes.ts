import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as batchService from './batch.service.js';

export async function batchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List batches */
  app.get('/', async (request) => {
    return batchService.listBatches(request.org!.orgId);
  });

  /** Get batch with stats */
  app.get('/:batchId', async (request) => {
    const { batchId } = request.params as { batchId: string };
    return batchService.getBatchById(batchId);
  });

  /** Create a batch (org_admin only) */
  app.post('/', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const body = request.body as {
      assessmentId: string;
      title: string;
      targetType?: string;
      targetConfig?: Record<string, unknown>;
      deadline?: string;
      totalTargets: number;
    };

    if (!body.assessmentId) throw new ValidationError('assessmentId is required');
    if (!body.title) throw new ValidationError('title is required');
    if (!body.totalTargets || body.totalTargets < 1) {
      throw new ValidationError('totalTargets must be at least 1');
    }

    const batch = await batchService.createBatch({
      orgId: request.org!.orgId,
      assessmentId: body.assessmentId,
      title: body.title,
      targetType: body.targetType,
      targetConfig: body.targetConfig,
      deadline: body.deadline ? new Date(body.deadline) : undefined,
      totalTargets: body.totalTargets,
      createdBy: request.user!.id,
    });

    await logAudit(request, 'create', 'assessment_batches', batch.id);
    return reply.status(201).send(batch);
  });

  /** Close a batch */
  app.patch('/:batchId/close', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const { batchId } = request.params as { batchId: string };
    const updated = await batchService.updateBatchStatus(batchId, 'closed');
    await logAudit(request, 'update', 'assessment_batches', batchId);
    return updated;
  });
}
