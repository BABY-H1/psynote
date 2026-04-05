import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as instanceService from './instance.service.js';

export async function instanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  app.get('/', async (request) => {
    const query = request.query as { status?: string };
    return instanceService.listInstances(request.org!.orgId, query.status);
  });

  app.get('/:instanceId', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return instanceService.getInstanceById(instanceId);
  });

  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      schemeId?: string;
      title: string;
      description?: string;
      category?: string;
      leaderId?: string;
      schedule?: string;
      duration?: string;
      startDate?: string;
      location?: string;
      status?: string;
      capacity?: number;
      screeningAssessmentId?: string;
      preAssessmentId?: string;
      postAssessmentId?: string;
    };

    if (!body.title) throw new ValidationError('title is required');

    const instance = await instanceService.createInstance({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      ...body,
    });

    await logAudit(request, 'create', 'group_instances', instance.id);
    return reply.status(201).send(instance);
  });

  app.patch('/:instanceId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      category: string;
      leaderId: string;
      schedule: string;
      duration: string;
      startDate: string;
      location: string;
      status: string;
      capacity: number;
      screeningAssessmentId: string;
      preAssessmentId: string;
      postAssessmentId: string;
    }>;

    const updated = await instanceService.updateInstance(instanceId, body);
    await logAudit(request, 'update', 'group_instances', instanceId);
    return updated;
  });
}
