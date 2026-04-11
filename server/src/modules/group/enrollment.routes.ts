import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as enrollmentService from './enrollment.service.js';
import { findOrCreateUserByEmail } from './enrollment.service.js';

export async function enrollmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Batch enroll multiple members in a group instance */
  app.post('/:instanceId/enroll-batch', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      members: Array<{ userId?: string; name?: string; email?: string; phone?: string }>;
    };

    if (!body.members || !Array.isArray(body.members) || body.members.length === 0) {
      throw new ValidationError('members array is required');
    }

    const results: { enrolled: number; errors: Array<{ index: number; message: string }> } = {
      enrolled: 0,
      errors: [],
    };

    for (let i = 0; i < body.members.length; i++) {
      const member = body.members[i];
      try {
        let userId = member.userId;

        // If no userId, find or create user by email
        if (!userId && member.email) {
          const user = await findOrCreateUserByEmail({
            email: member.email,
            name: member.name,
            phone: member.phone,
            orgId: request.org!.orgId,
          });
          userId = user.id;
        }

        if (!userId) {
          results.errors.push({ index: i, message: '需要提供 userId 或 email' });
          continue;
        }

        await enrollmentService.enroll({ instanceId, userId });
        results.enrolled++;
      } catch (err: any) {
        results.errors.push({ index: i, message: err.message || '报名失败' });
      }
    }

    await logAudit(request, 'create', 'group_enrollments', instanceId);
    return reply.status(201).send(results);
  });

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
