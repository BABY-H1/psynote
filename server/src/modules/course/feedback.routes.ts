import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseEnrollments } from '../../db/schema.js';
import { rejectClient } from '../../middleware/reject-client.js';
import * as feedbackService from './feedback.service.js';

export async function feedbackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  // ─── Feedback Forms CRUD ───────────────────────────────────────

  app.get('/:instanceId/feedback-forms', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const query = request.query as { chapterId?: string };
    return feedbackService.listFeedbackForms(instanceId, query.chapterId);
  });

  app.post('/:instanceId/feedback-forms', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      chapterId?: string;
      title?: string;
      questions: unknown;
    };

    const form = await feedbackService.createFeedbackForm({
      instanceId,
      chapterId: body.chapterId,
      title: body.title,
      questions: body.questions,
    });

    return reply.status(201).send(form);
  });

  app.patch('/:instanceId/feedback-forms/:formId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { formId } = request.params as { instanceId: string; formId: string };
    const body = request.body as Partial<{
      title: string;
      questions: unknown;
      isActive: boolean;
    }>;

    return feedbackService.updateFeedbackForm(formId, body);
  });

  app.delete('/:instanceId/feedback-forms/:formId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { formId } = request.params as { instanceId: string; formId: string };
    await feedbackService.deleteFeedbackForm(formId);
    return reply.status(204).send();
  });

  // ─── Feedback Responses ────────────────────────────────────────

  app.get('/:instanceId/feedback-forms/:formId/responses', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { formId } = request.params as { instanceId: string; formId: string };
    return feedbackService.listFeedbackResponses(formId);
  });

  app.post('/:instanceId/feedback/:formId/submit', async (request, reply) => {
    const { instanceId, formId } = request.params as { instanceId: string; formId: string };
    const body = request.body as { answers: unknown };

    // Look up the student's enrollment for this instance
    const [enrollment] = await db
      .select()
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.instanceId, instanceId),
        eq(courseEnrollments.userId, request.user!.id),
      ))
      .limit(1);

    if (!enrollment) {
      return reply.status(403).send({ error: 'You are not enrolled in this course instance' });
    }

    const response = await feedbackService.submitFeedbackResponse(formId, enrollment.id, body.answers);
    return reply.status(201).send(response);
  });

  // ─── Stats ─────────────────────────────────────────────────────

  app.get('/:instanceId/feedback-stats', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return feedbackService.getFeedbackStats(instanceId);
  });
}
