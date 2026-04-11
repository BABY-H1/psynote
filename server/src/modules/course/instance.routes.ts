import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as instanceService from './instance.service.js';

export async function courseInstanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // ─── List Instances ────────────────────────────────────────────

  app.get('/', async (request) => {
    const query = request.query as {
      status?: string;
      courseId?: string;
      search?: string;
    };

    return instanceService.listInstances(request.org!.orgId, {
      status: query.status,
      courseId: query.courseId,
      search: query.search,
    });
  });

  // ─── Get Instance Detail ───────────────────────────────────────

  app.get('/:instanceId', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return instanceService.getInstanceById(instanceId);
  });

  // ─── Create Instance ───────────────────────────────────────────

  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      courseId: string;
      title: string;
      description?: string;
      publishMode: string;
      status?: string;
      capacity?: number;
      targetGroupLabel?: string;
      responsibleId?: string;
      assessmentConfig?: object;
      location?: string;
      startDate?: string;
      schedule?: string;
    };

    if (!body.courseId) throw new ValidationError('courseId is required');
    if (!body.title) throw new ValidationError('title is required');
    if (!body.publishMode) throw new ValidationError('publishMode is required');

    const instance = await instanceService.createInstance({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      ...body,
    });

    await logAudit(request, 'create', 'course_instances', instance.id);
    return reply.status(201).send(instance);
  });

  // ─── Update Instance ───────────────────────────────────────────

  app.patch('/:instanceId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      publishMode: string;
      status: string;
      capacity: number;
      targetGroupLabel: string;
      responsibleId: string;
      assessmentConfig: object;
      location: string;
      startDate: string;
      schedule: string;
    }>;

    const updated = await instanceService.updateInstance(instanceId, body);
    await logAudit(request, 'update', 'course_instances', instanceId);
    return updated;
  });

  // ─── Delete Instance ───────────────────────────────────────────

  app.delete('/:instanceId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    await instanceService.deleteInstance(instanceId);
    await logAudit(request, 'delete', 'course_instances', instanceId);
    return reply.status(204).send();
  });

  // ─── Lifecycle: Activate ───────────────────────────────────────

  app.post('/:instanceId/activate', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const updated = await instanceService.activateInstance(instanceId);
    await logAudit(request, 'update', 'course_instances', instanceId);
    return updated;
  });

  // ─── Lifecycle: Close ──────────────────────────────────────────

  app.post('/:instanceId/close', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const updated = await instanceService.closeInstance(instanceId);
    await logAudit(request, 'update', 'course_instances', instanceId);
    return updated;
  });

  // ─── Lifecycle: Archive ────────────────────────────────────────

  app.post('/:instanceId/archive', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const updated = await instanceService.archiveInstance(instanceId);
    await logAudit(request, 'update', 'course_instances', instanceId);
    return updated;
  });
}
