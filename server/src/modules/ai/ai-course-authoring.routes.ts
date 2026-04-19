import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import {
  generateCourseBlueprint,
  refineCourseBlueprint,
  generateAllLessonBlocks,
  generateSingleLessonBlock,
  refineLessonBlock,
} from './pipelines/course-authoring.js';
import { chatCreateCourse } from './pipelines/create-course-chat.js';
import { extractCourse } from './pipelines/extract-course.js';

/**
 * Course-authoring AI: blueprint + multi-turn creation chat + text
 * extraction + blueprint refinement + lesson-block generation/refinement.
 */
export async function aiCourseAuthoringRoutes(app: FastifyInstance) {
  /** Generate course blueprint from requirements */
  app.post('/generate-course-blueprint', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { requirements: Record<string, any> };
    if (!body.requirements) throw new ValidationError('requirements is required');

    const blueprint = await generateCourseBlueprint({ requirements: body.requirements });
    await logAudit(request, 'ai_call', 'generate-course-blueprint');
    return blueprint;
  });

  /** AI-guided course creation via multi-turn conversation */
  app.post('/create-course-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required and must not be empty');
    }

    const result = await chatCreateCourse(body.messages);
    await logAudit(request, 'ai_call', 'create-course-chat');
    return result;
  });

  /** Extract course draft from raw text */
  app.post('/extract-course', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');
    const result = await extractCourse(body);
    await logAudit(request, 'ai_call', 'extract-course');
    return result;
  });

  /** Refine existing course blueprint */
  app.post('/refine-course-blueprint', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      currentBlueprint: Record<string, any>;
      instruction: string;
      requirements?: Record<string, any>;
    };
    if (!body.currentBlueprint) throw new ValidationError('currentBlueprint is required');
    if (!body.instruction) throw new ValidationError('instruction is required');

    const refined = await refineCourseBlueprint(body as any);
    await logAudit(request, 'ai_call', 'refine-course-blueprint');
    return refined;
  });

  /** Generate all lesson blocks for one session */
  app.post('/generate-lesson-blocks', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      blueprint: Record<string, any>;
      sessionIndex: number;
      requirements?: Record<string, any>;
    };
    if (!body.blueprint) throw new ValidationError('blueprint is required');
    if (body.sessionIndex == null) throw new ValidationError('sessionIndex is required');

    const blocks = await generateAllLessonBlocks(body as any);
    await logAudit(request, 'ai_call', 'generate-lesson-blocks');
    return { blocks };
  });

  /** Generate a single lesson block */
  app.post('/generate-lesson-block', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      blueprint: Record<string, any>;
      sessionIndex: number;
      blockType: string;
      existingBlocks?: { blockType: string; content: string }[];
    };
    if (!body.blueprint) throw new ValidationError('blueprint is required');
    if (!body.blockType) throw new ValidationError('blockType is required');

    const content = await generateSingleLessonBlock(body as any);
    await logAudit(request, 'ai_call', 'generate-lesson-block');
    return { content };
  });

  /** Refine a lesson block with instruction */
  app.post('/refine-lesson-block', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      blockContent: string;
      instruction: string;
      blueprint?: Record<string, any>;
      sessionIndex?: number;
    };
    if (!body.blockContent) throw new ValidationError('blockContent is required');
    if (!body.instruction) throw new ValidationError('instruction is required');

    const content = await refineLessonBlock(body as any);
    await logAudit(request, 'ai_call', 'refine-lesson-block');
    return { content };
  });
}
