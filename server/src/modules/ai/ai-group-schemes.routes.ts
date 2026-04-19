import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import {
  generateGroupScheme,
  generateGroupSchemeOverall,
  generateGroupSessionDetail,
  refineGroupSchemeOverall,
  refineGroupSessionDetail,
} from './pipelines/generate-scheme.js';
import { extractScheme } from './pipelines/extract-scheme.js';
import { chatCreateScheme } from './pipelines/create-scheme-chat.js';

/**
 * Group-counseling scheme authoring: full scheme generation + iterative
 * refinement (overall + per-session) + text-to-scheme extraction + chat.
 */
export async function aiGroupSchemesRoutes(app: FastifyInstance) {
  /** Generate full group counseling scheme */
  app.post('/generate-scheme', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { prompt: string };
    if (!body.prompt) throw new ValidationError('prompt is required');

    const scheme = await generateGroupScheme(body);
    await logAudit(request, 'ai_call', 'generate-scheme');
    return scheme;
  });

  /** Generate scheme overall structure (outline only) */
  app.post('/generate-scheme-overall', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { prompt: string };
    if (!body.prompt) throw new ValidationError('prompt is required');

    const overview = await generateGroupSchemeOverall(body);
    await logAudit(request, 'ai_call', 'generate-scheme-overall');
    return overview;
  });

  /** Generate detailed activities for a single session */
  app.post('/generate-session-detail', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      overallScheme: Record<string, unknown>;
      sessionIndex: number;
      prompt: string;
    };
    if (body.sessionIndex == null) throw new ValidationError('sessionIndex is required');

    const detail = await generateGroupSessionDetail(body as any);
    await logAudit(request, 'ai_call', 'generate-session-detail');
    return detail;
  });

  /** Refine scheme overall structure */
  app.post('/refine-scheme-overall', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      currentScheme: Record<string, unknown>;
      instruction: string;
    };
    if (!body.instruction) throw new ValidationError('instruction is required');

    const refined = await refineGroupSchemeOverall(body as any);
    await logAudit(request, 'ai_call', 'refine-scheme-overall');
    return refined;
  });

  /** Refine a specific session's details */
  app.post('/refine-session-detail', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      currentSession: Record<string, unknown>;
      overallScheme: Record<string, unknown>;
      sessionIndex: number;
      instruction: string;
    };
    if (!body.instruction) throw new ValidationError('instruction is required');

    const refined = await refineGroupSessionDetail(body as any);
    await logAudit(request, 'ai_call', 'refine-session-detail');
    return refined;
  });

  /** Extract group scheme from text */
  app.post('/extract-scheme', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');
    const result = await extractScheme(body);
    await logAudit(request, 'ai_call', 'extract-scheme');
    return result;
  });

  /** AI-guided group scheme creation chat */
  app.post('/create-scheme-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required');
    }
    const result = await chatCreateScheme(body.messages);
    await logAudit(request, 'ai_call', 'create-scheme-chat');
    return result;
  });
}
