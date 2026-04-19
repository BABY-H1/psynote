import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { extractScale } from './pipelines/extract-scale.js';
import { chatCreateScale } from './pipelines/create-scale-chat.js';
import { analyzeSessionMaterial, analyzeSessionMaterialForFormat } from './pipelines/session-material.js';
import { noteGuidanceChat } from './pipelines/note-guidance-chat.js';

/**
 * Scale authoring + session-material analysis + note-guidance chat.
 * These three concerns are grouped because they share the "parse / refine
 * counselor-facing structured content" pattern.
 */
export async function aiScalesMaterialRoutes(app: FastifyInstance) {
  /** Extract scale from text (replicates old extractScaleFromInput) */
  app.post('/extract-scale', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { content: string };
    if (!body.content) throw new ValidationError('content is required');

    const scale = await extractScale(body);
    await logAudit(request, 'ai_call', 'extract-scale');
    return scale;
  });

  /** AI-guided scale creation via multi-turn conversation */
  app.post('/create-scale-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('messages array is required and must not be empty');
    }

    const result = await chatCreateScale(body.messages);
    await logAudit(request, 'ai_call', 'create-scale-chat');
    return result;
  });

  /** Analyze raw session material → SOAP note (replicates old analyzeSessionMaterial) */
  app.post('/analyze-material', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      content: string;
      inputType?: 'text' | 'transcribed_audio' | 'transcribed_image';
    };
    if (!body.content) throw new ValidationError('content is required');

    const soap = await analyzeSessionMaterial(body);
    await logAudit(request, 'ai_call', 'analyze-material');
    return soap;
  });

  /** Format-aware material analysis */
  app.post('/analyze-material-formatted', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      content: string;
      format: string;
      fieldDefinitions: { key: string; label: string }[];
      inputType?: string;
    };
    if (!body.content) throw new ValidationError('content is required');
    if (!body.format || !body.fieldDefinitions?.length) throw new ValidationError('format and fieldDefinitions are required');

    const fields = await analyzeSessionMaterialForFormat(body);
    await logAudit(request, 'ai_call', 'analyze-material-formatted');
    return fields;
  });

  /** Conversational note guidance chat (A+B hybrid mode) */
  app.post('/note-guidance-chat', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      context: {
        format: string;
        fieldDefinitions: { key: string; label: string }[];
        clientContext?: { chiefComplaint?: string; treatmentGoals?: string[]; previousNoteSummary?: string };
        currentFields?: Record<string, string>;
        attachmentTexts?: string[];
      };
    };
    if (!body.messages || !body.context) throw new ValidationError('messages and context are required');

    const response = await noteGuidanceChat(body.messages, body.context);
    await logAudit(request, 'ai_call', 'note-guidance-chat');
    return response;
  });
}
