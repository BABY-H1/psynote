import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as courseService from './course.service.js';

export async function courseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // ─── Course CRUD ────────────────────────────────────────────────

  app.get('/', async (request) => {
    const query = request.query as {
      status?: string;
      courseType?: string;
      isTemplate?: string;
      search?: string;
    };
    return courseService.listCourses(request.org!.orgId, {
      status: query.status,
      courseType: query.courseType,
      isTemplate: query.isTemplate === 'true' ? true : query.isTemplate === 'false' ? false : undefined,
      search: query.search,
    });
  });

  app.get('/:courseId', async (request) => {
    const { courseId } = request.params as { courseId: string };
    return courseService.getCourseById(courseId);
  });

  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      category?: string;
      coverUrl?: string;
      duration?: string;
      isPublic?: boolean;
      status?: string;
      courseType?: string;
      targetAudience?: string;
      scenario?: string;
      isTemplate?: boolean;
      creationMode?: string;
      requirementsConfig?: Record<string, any>;
      blueprintData?: Record<string, any>;
      tags?: string[];
      chapters?: {
        title: string;
        content?: string;
        videoUrl?: string;
        duration?: string;
        relatedAssessmentId?: string;
        sessionGoal?: string;
        coreConcepts?: string;
        interactionSuggestions?: string;
        homeworkSuggestion?: string;
      }[];
    };

    if (!body.title) throw new ValidationError('title is required');

    const course = await courseService.createCourse({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      responsibleId: request.user!.id,
      ...body,
    });

    await logAudit(request, 'create', 'courses', course.id);
    return reply.status(201).send(course);
  });

  app.patch('/:courseId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const body = request.body as Partial<{
      title: string;
      description: string;
      category: string;
      coverUrl: string;
      duration: string;
      isPublic: boolean;
      status: string;
      courseType: string;
      targetAudience: string;
      scenario: string;
      responsibleId: string;
      isTemplate: boolean;
      requirementsConfig: Record<string, any>;
      blueprintData: Record<string, any>;
      tags: string[];
    }>;

    const updated = await courseService.updateCourse(courseId, body);
    await logAudit(request, 'update', 'courses', courseId);
    return updated;
  });

  app.delete('/:courseId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    await courseService.deleteCourse(courseId);
    await logAudit(request, 'delete', 'courses', courseId);
    return reply.status(204).send();
  });

  // ─── Lifecycle Operations ───────────────────────────────────────

  app.post('/:courseId/publish', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const updated = await courseService.publishCourse(courseId);
    await logAudit(request, 'update', 'courses', courseId);
    return updated;
  });

  app.post('/:courseId/archive', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const updated = await courseService.archiveCourse(courseId);
    await logAudit(request, 'update', 'courses', courseId);
    return updated;
  });

  app.post('/:courseId/clone', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    const cloned = await courseService.cloneCourse(courseId, request.user!.id, request.org!.orgId);
    await logAudit(request, 'create', 'courses', cloned.id);
    return reply.status(201).send(cloned);
  });

  // ─── Blueprint → Chapters ──────────────────────────────────────

  app.post('/:courseId/confirm-blueprint', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const body = request.body as {
      sessions: { title: string; goal: string; coreConcepts: string; interactionSuggestions: string; homeworkSuggestion: string }[];
    };
    if (!body.sessions?.length) throw new ValidationError('sessions array is required');
    return courseService.saveBlueprintAsChapters(courseId, body.sessions);
  });

  // ─── Lesson Blocks ─────────────────────────────────────────────

  app.get('/:courseId/chapters/:chapterId/blocks', async (request) => {
    const { chapterId } = request.params as { courseId: string; chapterId: string };
    return courseService.listLessonBlocks(chapterId);
  });

  app.put('/:courseId/chapters/:chapterId/blocks', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { chapterId } = request.params as { courseId: string; chapterId: string };
    const body = request.body as {
      blocks: { id?: string; blockType: string; content?: string; sortOrder: number; aiGenerated?: boolean; lastAiInstruction?: string }[];
    };
    return courseService.upsertLessonBlocks(chapterId, body.blocks || []);
  });

  app.patch('/:courseId/chapters/:chapterId/blocks/:blockId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { blockId } = request.params as { courseId: string; chapterId: string; blockId: string };
    const body = request.body as Partial<{ content: string; aiGenerated: boolean; lastAiInstruction: string }>;
    return courseService.updateLessonBlock(blockId, body);
  });

  // ─── Enrollment ─────────────────────────────────────────────────

  app.post('/:courseId/enroll', async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    const body = request.body as { careEpisodeId?: string } | undefined;

    const enrollment = await courseService.enrollInCourse({
      courseId,
      userId: request.user!.id,
      careEpisodeId: body?.careEpisodeId,
    });

    await logAudit(request, 'create', 'course_enrollments', enrollment.id);
    return reply.status(201).send(enrollment);
  });

  app.post('/:courseId/assign', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    const body = request.body as { clientUserId: string; careEpisodeId?: string };
    if (!body.clientUserId) throw new ValidationError('clientUserId is required');

    const enrollment = await courseService.assignCourseToClient({
      courseId,
      clientUserId: body.clientUserId,
      counselorId: request.user!.id,
      careEpisodeId: body.careEpisodeId,
    });

    await logAudit(request, 'create', 'course_enrollments', enrollment.id);
    return reply.status(201).send(enrollment);
  });

  app.patch('/enrollments/:enrollmentId/progress', async (request) => {
    const { enrollmentId } = request.params as { enrollmentId: string };
    const body = request.body as { chapterId: string; completed: boolean };
    if (!body.chapterId) throw new ValidationError('chapterId is required');
    return courseService.updateCourseProgress(enrollmentId, body.chapterId, body.completed);
  });

  // ─── Template Tags ──────────────────────────────────────────────

  app.get('/template-tags', async (request) => {
    return courseService.listTemplateTags(request.org!.orgId);
  });

  app.post('/template-tags', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as { name: string; color?: string };
    if (!body.name) throw new ValidationError('name is required');
    const tag = await courseService.createTemplateTag(request.org!.orgId, body.name, body.color);
    return reply.status(201).send(tag);
  });

  app.delete('/template-tags/:tagId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { tagId } = request.params as { tagId: string };
    await courseService.deleteTemplateTag(tagId);
    return reply.status(204).send();
  });
}
