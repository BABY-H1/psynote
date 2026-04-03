import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as goalService from './goal-library.service.js';

export async function goalLibraryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  app.get('/', async (request) => {
    const query = request.query as { problemArea?: string; category?: string; visibility?: string };
    return goalService.listGoals(request.org!.orgId, request.user!.id, query);
  });

  app.get('/:goalId', async (request) => {
    const { goalId } = request.params as { goalId: string };
    return goalService.getGoal(goalId);
  });

  app.post('/', { preHandler: [requireRole('org_admin', 'counselor')] }, async (request, reply) => {
    const body = request.body as {
      title: string; description?: string; problemArea: string; category?: string;
      objectivesTemplate?: string[]; interventionSuggestions?: string[]; visibility?: string;
    };
    if (!body.title || !body.problemArea) throw new ValidationError('title and problemArea are required');

    const goal = await goalService.createGoal({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      ...body,
    });
    await logAudit(request, 'create', 'treatment_goal_library', goal.id);
    return reply.status(201).send(goal);
  });

  app.patch('/:goalId', { preHandler: [requireRole('org_admin', 'counselor')] }, async (request) => {
    const { goalId } = request.params as { goalId: string };
    const body = request.body as Record<string, unknown>;
    const updated = await goalService.updateGoal(goalId, body);
    await logAudit(request, 'update', 'treatment_goal_library', goalId);
    return updated;
  });

  app.delete('/:goalId', { preHandler: [requireRole('org_admin', 'counselor')] }, async (request) => {
    const { goalId } = request.params as { goalId: string };
    await goalService.deleteGoal(goalId);
    await logAudit(request, 'delete', 'treatment_goal_library', goalId);
    return { success: true };
  });
}
