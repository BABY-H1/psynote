import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { aiClient } from './providers/openai-compatible.js';
import { chatConfigureScreeningRules } from './pipelines/create-screening-rules.js';
import { extractAgreement } from './pipelines/extract-agreement.js';
import { chatCreateAgreement } from './pipelines/create-agreement-chat.js';
import { extractNoteTemplate } from './pipelines/extract-note-template.js';
import { chatCreateNoteTemplate } from './pipelines/create-note-template-chat.js';
import { extractGoal } from './pipelines/extract-goal.js';
import { chatCreateGoal } from './pipelines/create-goal-chat.js';

/**
 * Templates + misc authoring routes:
 * - configure-screening-rules
 * - generic /refine
 * - agreement extraction + chat
 * - note-template extraction + chat
 * - groups/poster-copy (marketing)
 */
export async function aiTemplatesRoutes(app: FastifyInstance) {
  /** AI-guided screening rules configuration */
  app.post('/configure-screening-rules', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      context: {
        assessmentType: string;
        scales: {
          id: string;
          title: string;
          dimensions: { id: string; name: string; rules?: { minScore: number; maxScore: number; label: string; riskLevel?: string }[] }[];
          items: { id: string; text: string; options: { label: string; value: number }[] }[];
        }[];
      };
    };
    if (!body.messages || body.messages.length === 0) {
      throw new ValidationError('messages array is required');
    }
    if (!body.context) throw new ValidationError('context is required');

    const result = await chatConfigureScreeningRules(body.messages, body.context);
    await logAudit(request, 'ai_call', 'configure-screening-rules');
    return result;
  });

  /** General-purpose content refinement */
  app.post('/refine', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      content: string;
      instruction: string;
    };
    if (!body.content) throw new ValidationError('content is required');
    if (!body.instruction) throw new ValidationError('instruction is required');

    const refined = await aiClient.generate(
      '你是一位专业的心理咨询内容编辑。请按照用户的指令优化以下内容，保持专业性和可读性。',
      `指令: ${body.instruction}\n\n原始内容:\n${body.content}`,
      { temperature: 0.5 },
    );

    await logAudit(request, 'ai_call', 'refine');
    return { refined };
  });

  /** Extract agreement template from text */
  app.post('/extract-agreement', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');
    const result = await extractAgreement(body);
    await logAudit(request, 'ai_call', 'extract-agreement');
    return result;
  });

  /** AI-guided agreement creation chat */
  app.post('/create-agreement-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required');
    }
    const result = await chatCreateAgreement(body.messages);
    await logAudit(request, 'ai_call', 'create-agreement-chat');
    return result;
  });

  /** Extract note template from text */
  app.post('/extract-note-template', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');
    const result = await extractNoteTemplate(body);
    await logAudit(request, 'ai_call', 'extract-note-template');
    return result;
  });

  /** AI-guided note template creation chat */
  app.post('/create-note-template-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required');
    }
    const result = await chatCreateNoteTemplate(body.messages);
    await logAudit(request, 'ai_call', 'create-note-template-chat');
    return result;
  });

  /** Extract treatment goal from text */
  app.post('/extract-goal', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');
    const result = await extractGoal(body);
    await logAudit(request, 'ai_call', 'extract-goal');
    return result;
  });

  /** AI-guided treatment goal creation chat */
  app.post('/create-goal-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required');
    }
    const result = await chatCreateGoal(body.messages);
    await logAudit(request, 'ai_call', 'create-goal-chat');
    return result;
  });

  /**
   * Generate marketing copy for group/course poster.
   *
   * Special case: this route has a degraded-mode fallback BEFORE the
   * `aiClient.isConfigured` guard short-circuits the request — we return
   * an empty copy struct so poster rendering degrades gracefully. The
   * parent-level guard returns 503 generically; this handler's early
   * check overrides that with a 200 empty-copy response so the UI doesn't
   * show an error banner just for the poster preview.
   */
  app.post('/groups/poster-copy', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    if (!aiClient.isConfigured) {
      return { headline: '', subtitle: '', points: [] };
    }
    const body = request.body as { title: string; description?: string; schedule?: string; location?: string };
    if (!body.title) throw new ValidationError('title is required');
    const { generatePosterCopy } = await import('./pipelines/poster-copy.js');
    const result = await generatePosterCopy(body);
    await logAudit(request, 'ai_call', 'groups/poster-copy');
    return result;
  });
}
