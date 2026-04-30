import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { assertAuthorized } from '../../middleware/authorize.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as resultService from './result.service.js';

export async function resultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** List results with optional filters */
  app.get('/', async (request) => {
    const query = request.query as {
      assessmentId?: string;
      userId?: string;
      careEpisodeId?: string;
      batchId?: string;
      riskLevel?: string;
    };

    return resultService.listResults(request.org!.orgId, { ...query, scope: request.dataScope });
  });

  /** Get a single result */
  app.get('/:resultId', async (request) => {
    const { resultId } = request.params as { resultId: string };
    const result = await resultService.getResultById(resultId);

    // Phase 1.5: 测评原始答卷 = phi_full;clinic_admin 默认禁。
    // 来访者本人查自己的(self_only)由 policy.checkScope 处理。
    // result.userId 是 string | null;userId 缺失的匿名结果不走密级检查
    // (那种结果通常是开放预测评,本身就没有"本人"概念)
    if (result.userId && result.userId !== request.user!.id) {
      assertAuthorized(request, 'view', {
        type: 'assessment_result',
        dataClass: 'phi_full',
        ownerUserId: result.userId,
      });
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

  /**
   * Phase 9β — Trajectory: time-ordered series of (score, risk, dimensions)
   * for one client × one scale. Powers the longitudinal chart on the
   * counselor archive and (when client_visible=true) the portal report detail.
   *
   * GET /api/orgs/:orgId/results/trajectory?userId=...&scaleId=...
   */
  app.get('/trajectory', async (request) => {
    const q = request.query as { userId?: string; scaleId?: string };
    if (!q.userId) throw new ValidationError('userId is required');
    if (!q.scaleId) throw new ValidationError('scaleId is required');
    return resultService.getTrajectory(request.org!.orgId, q.userId, q.scaleId);
  });

  /**
   * Phase 9β — Toggle client visibility for a single result.
   * Default is false; counselor flips it on per result.
   * PATCH /api/orgs/:orgId/results/:resultId/client-visible
   * body: { visible: boolean }
   */
  app.patch('/:resultId/client-visible', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { resultId } = request.params as { resultId: string };
    const body = request.body as { visible?: boolean };
    if (typeof body.visible !== 'boolean') throw new ValidationError('visible (boolean) is required');
    const row = await resultService.setClientVisible(resultId, body.visible);
    await logAudit(request, 'update', 'assessment_results', resultId, {
      clientVisible: { old: !body.visible, new: body.visible },
    });
    return row;
  });

  /**
   * Phase 9β — Persist AI recommendations on a result row.
   * Called by the counselor UI after running the triage AI.
   * PATCH /api/orgs/:orgId/results/:resultId/recommendations
   * body: { recommendations: TriageRecommendation[] }
   */
  app.patch('/:resultId/recommendations', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { resultId } = request.params as { resultId: string };
    const body = request.body as { recommendations?: unknown[] };
    if (!Array.isArray(body.recommendations)) {
      throw new ValidationError('recommendations (array) is required');
    }
    return resultService.setRecommendations(resultId, body.recommendations);
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
