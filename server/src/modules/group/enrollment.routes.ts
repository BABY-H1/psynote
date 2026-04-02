import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as enrollmentService from './enrollment.service.js';

export async function enrollmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Enroll in a group instance */
  app.post('/:instanceId/enroll', async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      userId?: string;
      careEpisodeId?: string;
      screeningResultId?: string;
    };

    const enrollment = await enrollmentService.enroll({
      instanceId,
      userId: body.userId || request.user!.id,
      careEpisodeId: body.careEpisodeId,
      screeningResultId: body.screeningResultId,
    });

    await logAudit(request, 'create', 'group_enrollments', enrollment.id);
    return reply.status(201).send(enrollment);
  });

  /** Approve/reject enrollment */
  app.patch('/enrollments/:enrollmentId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { enrollmentId } = request.params as { enrollmentId: string };
    const body = request.body as { status: string };

    if (!body.status) throw new ValidationError('status is required');

    const updated = await enrollmentService.updateEnrollmentStatus(
      enrollmentId,
      body.status,
      request.user!.id,
    );

    await logAudit(request, 'update', 'group_enrollments', enrollmentId);
    return updated;
  });
}
