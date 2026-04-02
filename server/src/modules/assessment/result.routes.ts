import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as resultService from './result.service.js';

export async function resultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List results with optional filters */
  app.get('/', async (request) => {
    const query = request.query as {
      assessmentId?: string;
      userId?: string;
      careEpisodeId?: string;
      batchId?: string;
      riskLevel?: string;
    };

    return resultService.listResults(request.org!.orgId, query);
  });

  /** Get a single result */
  app.get('/:resultId', async (request) => {
    const { resultId } = request.params as { resultId: string };
    const result = await resultService.getResultById(resultId);

    // Log PHI access if viewing another user's result
    if (result.userId && result.userId !== request.user!.id) {
      await logPhiAccess(request, result.userId, 'assessment_results', 'view', result.id);
    }

    return result;
  });

  /** Submit a result (counselor submitting on behalf, or authenticated user) */
  app.post('/', async (request, reply) => {
    const body = request.body as {
      assessmentId: string;
      userId?: string;
      careEpisodeId?: string;
      batchId?: string;
      demographicData?: Record<string, unknown>;
      answers: Record<string, number>;
    };

    if (!body.assessmentId) throw new ValidationError('assessmentId is required');
    if (!body.answers || Object.keys(body.answers).length === 0) {
      throw new ValidationError('answers are required');
    }

    const result = await resultService.submitResult({
      orgId: request.org!.orgId,
      assessmentId: body.assessmentId,
      userId: body.userId || request.user!.id,
      careEpisodeId: body.careEpisodeId,
      batchId: body.batchId,
      demographicData: body.demographicData,
      answers: body.answers,
      createdBy: request.user!.id,
    });

    await logAudit(request, 'create', 'assessment_results', result.id);
    return reply.status(201).send(result);
  });

  /** Soft delete a result */
  app.delete('/:resultId', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const { resultId } = request.params as { resultId: string };
    await resultService.softDeleteResult(resultId);
    await logAudit(request, 'delete', 'assessment_results', resultId);
    return reply.status(204).send();
  });
}

/**
 * Public result submission — no auth required.
 * Used for anonymous/public screening assessments.
 */
export async function publicResultRoutes(app: FastifyInstance) {
  app.post('/:assessmentId/submit', async (request, reply) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const body = request.body as {
      demographicData?: Record<string, unknown>;
      answers: Record<string, number>;
    };

    if (!body.answers || Object.keys(body.answers).length === 0) {
      throw new ValidationError('answers are required');
    }

    // For public submissions, we need to look up the assessment to get the orgId
    const result = await resultService.submitResult({
      orgId: '', // Will be resolved from the assessment
      assessmentId,
      demographicData: body.demographicData,
      answers: body.answers,
    });

    return reply.status(201).send(result);
  });
}
