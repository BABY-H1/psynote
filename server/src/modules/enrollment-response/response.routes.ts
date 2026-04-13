/**
 * Phase 9α — Enrollment block response routes.
 *
 * Two entry points:
 *   1. Counselor-side: mounted at /api/orgs/:orgId/enrollment-responses
 *      — list, mark reviewed, pending safety flags
 *   2. Portal (learner) side: mounted at /api/orgs/:orgId/client/enrollment-responses
 *      — submit response for self
 *
 * Both share the same service layer.
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as service from './response.service.js';
import type { EnrollmentType } from './response.service.js';
import { rejectClient } from '../../middleware/reject-client.js';

/** Counselor-facing response routes. */
export async function enrollmentResponseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  /**
   * GET /api/orgs/:orgId/enrollment-responses?enrollmentId=...&enrollmentType=course
   * List all responses for an enrollment.
   */
  app.get('/', async (request) => {
    const q = request.query as { enrollmentId?: string; enrollmentType?: string };
    if (!q.enrollmentId) throw new ValidationError('enrollmentId is required');
    if (q.enrollmentType !== 'course' && q.enrollmentType !== 'group') {
      throw new ValidationError('enrollmentType must be course or group');
    }
    return service.listResponsesForEnrollment(q.enrollmentId, q.enrollmentType as EnrollmentType);
  });

  /**
   * GET /api/orgs/:orgId/enrollment-responses/pending-safety
   * List safety-flagged responses pending counselor review in the current org.
   */
  app.get('/pending-safety', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    return service.listPendingSafetyFlags(request.org!.orgId);
  });

  /**
   * POST /api/orgs/:orgId/enrollment-responses/:responseId/review
   * Mark a flagged response as reviewed by the counselor.
   */
  app.post('/:responseId/review', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { responseId } = request.params as { responseId: string };
    const row = await service.markReviewed(responseId);
    await logAudit(request, 'update', 'enrollment_block_responses', responseId);
    return row;
  });
}

/**
 * Client-portal facing: the learner submits their own response.
 * Mounted separately to keep the data-scope boundary explicit.
 */
export async function clientEnrollmentResponseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /**
   * POST /api/orgs/:orgId/client/enrollment-responses
   * body: { enrollmentId, enrollmentType, blockId, response }
   * Ownership verified via user id.
   */
  app.post('/', async (request, reply) => {
    const body = request.body as {
      enrollmentId?: string;
      enrollmentType?: string;
      blockId?: string;
      response?: unknown;
    };
    if (!body.enrollmentId) throw new ValidationError('enrollmentId is required');
    if (body.enrollmentType !== 'course' && body.enrollmentType !== 'group') {
      throw new ValidationError('enrollmentType must be course or group');
    }
    if (!body.blockId) throw new ValidationError('blockId is required');

    const result = await service.submitResponse({
      enrollmentId: body.enrollmentId,
      enrollmentType: body.enrollmentType as EnrollmentType,
      blockId: body.blockId,
      response: body.response ?? null,
      userId: request.user!.id,
    });

    return reply.status(201).send(result);
  });
}
