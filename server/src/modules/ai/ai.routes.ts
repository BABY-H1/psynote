import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole, requireClinicalAccess } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { aiClient } from './providers/openai-compatible.js';
import { interpretResult } from './pipelines/interpretation.js';
import { assessRisk } from './pipelines/risk-detection.js';
import { recommendTriage } from './pipelines/triage.js';
import { analyzeSOAP } from './pipelines/soap-analysis.js';
import { generateProgressReport } from './pipelines/progress-report.js';
import { generateReferralSummary } from './pipelines/referral-summary.js';
import { generateRecommendations } from './pipelines/recommendation.js';
import { extractScale } from './pipelines/extract-scale.js';
import { chatCreateScale } from './pipelines/create-scale-chat.js';
import { chatConfigureScreeningRules } from './pipelines/create-screening-rules.js';
import {
  generateGroupScheme,
  generateGroupSchemeOverall,
  generateGroupSessionDetail,
  refineGroupSchemeOverall,
  refineGroupSessionDetail,
} from './pipelines/generate-scheme.js';
import { analyzeSessionMaterial, analyzeSessionMaterialForFormat } from './pipelines/session-material.js';
import { noteGuidanceChat } from './pipelines/note-guidance-chat.js';
import { suggestTreatmentPlan } from './pipelines/treatment-plan.js';
import { buildAndGenerateClientSummary } from '../counseling/client-summary.service.js';
import { buildAndGenerateCaseProgressReport } from '../counseling/progress-report.service.js';
import { simulatedClientChat } from './pipelines/simulated-client.js';
import { supervisionChat } from './pipelines/supervision.js';
import {
  generateCourseBlueprint,
  refineCourseBlueprint,
  generateAllLessonBlocks,
  generateSingleLessonBlock,
  refineLessonBlock,
} from './pipelines/course-authoring.js';
import { extractAgreement } from './pipelines/extract-agreement.js';
import { chatCreateAgreement } from './pipelines/create-agreement-chat.js';
import { extractNoteTemplate } from './pipelines/extract-note-template.js';
import { chatCreateNoteTemplate } from './pipelines/create-note-template-chat.js';
import { extractScheme } from './pipelines/extract-scheme.js';
import { chatCreateScheme } from './pipelines/create-scheme-chat.js';

export async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);
  app.addHook('preHandler', requireClinicalAccess());

  // Check AI is configured
  app.addHook('preHandler', async (_request, reply) => {
    if (!aiClient.isConfigured) {
      return reply.status(503).send({ error: 'AI service is not configured' });
    }
  });

  /** Interpret assessment result */
  app.post('/interpret-result', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      scaleName: string;
      dimensions: { name: string; score: number; label: string; riskLevel?: string; advice?: string }[];
      totalScore: number;
      riskLevel?: string;
    };

    if (!body.scaleName) throw new ValidationError('scaleName is required');

    const interpretation = await interpretResult(body);
    await logAudit(request, 'ai_call', 'interpret-result');
    return { interpretation };
  });

  /** AI risk assessment */
  app.post('/risk-assess', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      dimensions: { name: string; score: number; label: string; riskLevel?: string }[];
      totalScore: number;
      ruleBasedRisk: string | null;
      demographics?: Record<string, unknown>;
      chiefComplaint?: string;
    };

    const result = await assessRisk(body);
    await logAudit(request, 'ai_call', 'risk-assess');
    return result;
  });

  /** Triage recommendation */
  app.post('/triage', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      chiefComplaint?: string;
      availableInterventions?: string[];
    };

    if (!body.riskLevel) throw new ValidationError('riskLevel is required');

    const recommendation = await recommendTriage({
      ...body,
      availableInterventions: body.availableInterventions || ['course', 'group', 'counseling', 'referral'],
    });

    await logAudit(request, 'ai_call', 'triage');
    return recommendation;
  });

  /** SOAP note analysis */
  app.post('/analyze-session', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
      sessionType?: string;
      duration?: number;
      previousNotes?: string;
    };

    const analysis = await analyzeSOAP(body);
    await logAudit(request, 'ai_call', 'analyze-session');
    return analysis;
  });

  /** Progress comparison report */
  app.post('/progress-report', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      clientName?: string;
      comparisons: {
        date: string;
        totalScore: number;
        riskLevel: string;
        dimensionScores: Record<string, number>;
      }[];
      dimensionNames: Record<string, string>;
      interventionType?: string;
    };

    if (!body.comparisons || body.comparisons.length < 2) {
      throw new ValidationError('At least 2 comparison data points are required');
    }

    const report = await generateProgressReport(body);
    await logAudit(request, 'ai_call', 'progress-report');
    return { report };
  });

  /** Referral summary */
  app.post('/referral-summary', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      reason: string;
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      chiefComplaint?: string;
      sessionHistory?: string;
      targetType?: string;
    };

    if (!body.reason) throw new ValidationError('reason is required');

    const summary = await generateReferralSummary(body);
    await logAudit(request, 'ai_call', 'referral-summary');
    return { summary };
  });

  /** Suggest treatment plan goals and interventions */
  app.post('/suggest-treatment-plan', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as {
      chiefComplaint?: string;
      riskLevel?: string;
      assessmentSummary?: string;
      sessionNotes?: string;
      clientContext?: {
        name?: string;
        age?: number;
        gender?: string;
        presentingIssues?: string[];
      };
    };

    const suggestion = await suggestTreatmentPlan(body);
    await logAudit(request, 'ai_call', 'suggest-treatment-plan');
    return suggestion;
  });

  /** AI client summary / risk profile */
  app.post('/client-summary', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { clientId: string; episodeId: string };
    if (!body.clientId || !body.episodeId) throw new ValidationError('clientId and episodeId are required');

    const summary = await buildAndGenerateClientSummary(request.org!.orgId, body.clientId, body.episodeId);
    await logAudit(request, 'ai_call', 'client-summary');
    return summary;
  });

  /** AI case progress report */
  app.post('/case-progress-report', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { episodeId: string };
    if (!body.episodeId) throw new ValidationError('episodeId is required');

    const report = await buildAndGenerateCaseProgressReport(request.org!.orgId, body.episodeId);
    await logAudit(request, 'ai_call', 'case-progress-report');
    return report;
  });

  /** Simulated client conversation */
  app.post('/simulated-client', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: string; content: string }[]; context: any };
    const result = await simulatedClientChat(body.messages || [], body.context || {});
    await logAudit(request, 'ai_call', 'simulated-client');
    return result;
  });

  /** Supervision conversation */
  app.post('/supervision', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const body = request.body as { messages: { role: string; content: string }[]; context: any };
    const result = await supervisionChat(body.messages || [], body.context || {});
    await logAudit(request, 'ai_call', 'supervision');
    return result;
  });

  /** Personalized recommendations (for client portal) */
  app.post('/recommendations', async (request) => {
    const body = request.body as {
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      interventionType?: string;
      availableCourses?: { id: string; title: string; category: string }[];
      availableGroups?: { id: string; title: string; category: string }[];
    };

    const result = await generateRecommendations(body);
    await logAudit(request, 'ai_call', 'recommendations');
    return result;
  });

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

  // ─── Course Authoring AI ──────────────────────────────────────

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
