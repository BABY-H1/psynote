import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as assessmentService from './assessment.service.js';

export async function assessmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List assessments for the current org */
  app.get('/', async (request) => {
    const query = request.query as { includeDeleted?: string };
    const includeDeleted = query.includeDeleted === 'true';
    return assessmentService.listAssessments(request.org!.orgId, includeDeleted);
  });

  /** Get a single assessment with its scales */
  app.get('/:assessmentId', async (request) => {
    const { assessmentId } = request.params as { assessmentId: string };
    return assessmentService.getAssessmentById(assessmentId);
  });

  /** Create a new assessment (org_admin or counselor) */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      demographics?: unknown[];
      scaleIds: string[];
    };

    if (!body.title) throw new ValidationError('title is required');
    if (!body.scaleIds || body.scaleIds.length === 0) {
      throw new ValidationError('At least one scale is required');
    }

    const assessment = await assessmentService.createAssessment({
      orgId: request.org!.orgId,
      title: body.title,
      description: body.description,
      demographics: body.demographics,
      scaleIds: body.scaleIds,
      createdBy: request.user!.id,
    });

    await logAudit(request, 'create', 'assessments', assessment.id);
    return reply.status(201).send(assessment);
  });

  /** Update an assessment */
  app.patch('/:assessmentId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      demographics: unknown[];
      isActive: boolean;
      scaleIds: string[];
    }>;

    const updated = await assessmentService.updateAssessment(assessmentId, body);
    await logAudit(request, 'update', 'assessments', assessmentId);
    return updated;
  });

  /** Soft delete an assessment */
  app.delete('/:assessmentId', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const { assessmentId } = request.params as { assessmentId: string };
    await assessmentService.softDeleteAssessment(assessmentId);
    await logAudit(request, 'delete', 'assessments', assessmentId);
    return reply.status(204).send();
  });

  /** Restore a soft-deleted assessment */
  app.post('/:assessmentId/restore', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const restored = await assessmentService.restoreAssessment(assessmentId);
    await logAudit(request, 'update', 'assessments', assessmentId);
    return restored;
  });
}
