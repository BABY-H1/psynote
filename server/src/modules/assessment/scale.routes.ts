import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as scaleService from './scale.service.js';

export async function scaleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List scales visible to this org */
  app.get('/', async (request) => {
    return scaleService.listScales(request.org!.orgId);
  });

  /** Get a single scale with dimensions, rules, items */
  app.get('/:scaleId', async (request) => {
    const { scaleId } = request.params as { scaleId: string };
    return scaleService.getScaleById(scaleId);
  });

  /** Create a new scale (org_admin or counselor) */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      instructions?: string;
      scoringMode?: string;
      isPublic?: boolean;
      dimensions: {
        name: string;
        description?: string;
        calculationMethod?: string;
        sortOrder?: number;
        rules?: {
          minScore: number;
          maxScore: number;
          label: string;
          description?: string;
          advice?: string;
          riskLevel?: string;
        }[];
      }[];
      items: {
        text: string;
        dimensionIndex: number;
        isReverseScored?: boolean;
        options: { label: string; value: number }[];
        sortOrder?: number;
      }[];
    };

    if (!body.title) throw new ValidationError('title is required');
    if (!body.dimensions || body.dimensions.length === 0) {
      throw new ValidationError('At least one dimension is required');
    }
    if (!body.items || body.items.length === 0) {
      throw new ValidationError('At least one item is required');
    }

    const scale = await scaleService.createScale({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      ...body,
    });

    await logAudit(request, 'create', 'scales', scale.id);
    return reply.status(201).send(scale);
  });

  /** Update scale metadata */
  app.patch('/:scaleId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { scaleId } = request.params as { scaleId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      instructions: string;
      scoringMode: string;
      isPublic: boolean;
    }>;

    const updated = await scaleService.updateScale(scaleId, body);
    await logAudit(request, 'update', 'scales', scaleId);
    return updated;
  });

  /** Delete a scale */
  app.delete('/:scaleId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { scaleId } = request.params as { scaleId: string };
    await scaleService.deleteScale(scaleId);
    await logAudit(request, 'delete', 'scales', scaleId);
    return reply.status(204).send();
  });
}
