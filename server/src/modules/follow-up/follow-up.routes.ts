import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as followUpService from './follow-up.service.js';

export async function followUpRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  // ─── Plans ───────────────────────────────────────────────────

  /** List follow-up plans */
  app.get('/plans', async (request) => {
    const query = request.query as { careEpisodeId?: string };
    return followUpService.listFollowUpPlans(request.org!.orgId, query.careEpisodeId, request.dataScope);
  });

  /** Create a follow-up plan */
  app.post('/plans', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId: string;
      planType?: string;
      assessmentId?: string;
      frequency?: string;
      nextDue?: string;
      notes?: string;
    };

    if (!body.careEpisodeId) throw new ValidationError('careEpisodeId is required');

    const plan = await followUpService.createFollowUpPlan({
      orgId: request.org!.orgId,
      careEpisodeId: body.careEpisodeId,
      counselorId: request.user!.id,
      planType: body.planType,
      assessmentId: body.assessmentId,
      frequency: body.frequency,
      nextDue: body.nextDue ? new Date(body.nextDue) : undefined,
      notes: body.notes,
    });

    await logAudit(request, 'create', 'follow_up_plans', plan.id);
    return reply.status(201).send(plan);
  });

  /** Update a follow-up plan */
  app.patch('/plans/:planId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { planId } = request.params as { planId: string };
    const body = request.body as Partial<{
      frequency: string;
      nextDue: string;
      status: string;
      notes: string;
    }>;

    const updated = await followUpService.updateFollowUpPlan(planId, {
      ...body,
      nextDue: body.nextDue ? new Date(body.nextDue) : undefined,
    });

    await logAudit(request, 'update', 'follow_up_plans', planId);
    return updated;
  });

  // ─── Reviews ─────────────────────────────────────────────────

  /** List follow-up reviews for an episode */
  app.get('/reviews', async (request) => {
    const query = request.query as { careEpisodeId: string };
    if (!query.careEpisodeId) throw new ValidationError('careEpisodeId query param is required');
    return followUpService.listFollowUpReviews(query.careEpisodeId);
  });

  /** Submit a follow-up review (clinical judgement) */
  app.post('/reviews', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      planId: string;
      careEpisodeId: string;
      resultId?: string;
      riskBefore?: string;
      riskAfter?: string;
      clinicalNote?: string;
      decision?: string;
    };

    if (!body.planId) throw new ValidationError('planId is required');
    if (!body.careEpisodeId) throw new ValidationError('careEpisodeId is required');

    const review = await followUpService.createFollowUpReview({
      planId: body.planId,
      careEpisodeId: body.careEpisodeId,
      counselorId: request.user!.id,
      resultId: body.resultId,
      riskBefore: body.riskBefore,
      riskAfter: body.riskAfter,
      clinicalNote: body.clinicalNote,
      decision: body.decision,
    });

    await logAudit(request, 'create', 'follow_up_reviews', review.id);
    return reply.status(201).send(review);
  });
}
