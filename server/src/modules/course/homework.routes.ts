import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseEnrollments } from '../../db/schema.js';
import { rejectClient } from '../../middleware/reject-client.js';
import * as homeworkService from './homework.service.js';

export async function homeworkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  // ─── Homework Definitions CRUD ─────────────────────────────────

  app.get('/:instanceId/homework-defs', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const query = request.query as { chapterId?: string };
    return homeworkService.listHomeworkDefs(instanceId, query.chapterId);
  });

  app.post('/:instanceId/homework-defs', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      chapterId?: string;
      title?: string;
      description?: string;
      questionType: string;
      options?: unknown;
      isRequired?: boolean;
      sortOrder?: number;
    };

    const def = await homeworkService.createHomeworkDef({
      instanceId,
      chapterId: body.chapterId,
      title: body.title,
      description: body.description,
      questionType: body.questionType,
      options: body.options,
      isRequired: body.isRequired,
      sortOrder: body.sortOrder,
    });

    return reply.status(201).send(def);
  });

  app.patch('/:instanceId/homework-defs/:defId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { defId } = request.params as { instanceId: string; defId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      questionType: string;
      options: unknown;
      isRequired: boolean;
      sortOrder: number;
    }>;

    return homeworkService.updateHomeworkDef(defId, body);
  });

  app.delete('/:instanceId/homework-defs/:defId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { defId } = request.params as { instanceId: string; defId: string };
    await homeworkService.deleteHomeworkDef(defId);
    return reply.status(204).send();
  });

  // ─── Submissions ───────────────────────────────────────────────

  app.get('/:instanceId/homework-defs/:defId/submissions', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { defId } = request.params as { instanceId: string; defId: string };
    return homeworkService.listSubmissions(defId);
  });

  app.post('/:instanceId/homework/:defId/submit', async (request, reply) => {
    const { instanceId, defId } = request.params as { instanceId: string; defId: string };
    const body = request.body as { content?: string; selectedOptions?: unknown };

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

    const submission = await homeworkService.submitHomework(
      defId,
      enrollment.id,
      body.content,
      body.selectedOptions,
    );

    return reply.status(201).send(submission);
  });

  // ─── Review ────────────────────────────────────────────────────

  app.patch('/:instanceId/homework/submissions/:subId/review', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { subId } = request.params as { instanceId: string; subId: string };
    const body = request.body as { reviewComment: string };

    return homeworkService.reviewSubmission(subId, body.reviewComment, request.user!.id);
  });
}
