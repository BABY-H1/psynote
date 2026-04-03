import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as planService from './treatment-plan.service.js';

export async function treatmentPlanRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List treatment plans for an episode */
  app.get('/', async (request) => {
    const { careEpisodeId } = request.query as { careEpisodeId?: string };
    if (!careEpisodeId) throw new ValidationError('careEpisodeId is required');
    return planService.listPlans(request.org!.orgId, careEpisodeId);
  });

  /** Get a single treatment plan */
  app.get('/:planId', async (request) => {
    const { planId } = request.params as { planId: string };
    return planService.getPlan(planId);
  });

  /** Create a treatment plan */
  app.post(
    '/',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request, reply) => {
      const body = request.body as {
        careEpisodeId: string;
        title?: string;
        approach?: string;
        goals?: unknown[];
        interventions?: unknown[];
        sessionPlan?: string;
        progressNotes?: string;
        reviewDate?: string;
        status?: string;
      };

      if (!body.careEpisodeId) throw new ValidationError('careEpisodeId is required');

      const plan = await planService.createPlan({
        orgId: request.org!.orgId,
        counselorId: request.user!.id,
        ...body,
      });

      await logAudit(request, 'create', 'treatment_plans', plan.id);
      return reply.status(201).send(plan);
    },
  );

  /** Update a treatment plan */
  app.patch(
    '/:planId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { planId } = request.params as { planId: string };
      const body = request.body as Record<string, unknown>;

      const updated = await planService.updatePlan(planId, body);
      await logAudit(request, 'update', 'treatment_plans', planId);
      return updated;
    },
  );

  /** Update a goal's status */
  app.patch(
    '/:planId/goals/:goalId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { planId, goalId } = request.params as { planId: string; goalId: string };
      const { status } = request.body as { status: string };

      const updated = await planService.updateGoalStatus(planId, goalId, status);
      await logAudit(request, 'update', 'treatment_plans', planId);
      return updated;
    },
  );
}
