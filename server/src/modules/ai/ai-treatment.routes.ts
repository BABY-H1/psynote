import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { suggestTreatmentPlan } from './pipelines/treatment-plan.js';
import { buildAndGenerateClientSummary } from '../counseling/client-summary.service.js';
import { buildAndGenerateCaseProgressReport } from '../counseling/progress-report.service.js';
import { simulatedClientChat } from './pipelines/simulated-client.js';
import { supervisionChat } from './pipelines/supervision.js';
import { generateRecommendations } from './pipelines/recommendation.js';

/**
 * Treatment-plan and counselor-support AI routes: suggestion, client
 * summary, case progress report, simulated-client + supervision chat,
 * and personalized recommendations (client portal).
 */
export async function aiTreatmentRoutes(app: FastifyInstance) {
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

  /**
   * Personalized recommendations (for client portal).
   * Note: no `requireRole` preHandler — open to all authenticated users
   * including `client`, because portal consumes this endpoint.
   */
  app.post('/recommendations', async (request) => {
    const body = request.body as {
      riskLevel?: string;
      dimensions?: { name: string; score: number; label: string }[];
      interventionType?: string;
      availableCourses?: { id: string; title: string; category: string }[];
      availableGroups?: { id: string; title: string; category: string }[];
    };
    // Validate required fields up-front — without these the pipeline crashes
    // on `.map` of undefined deep in the prompt builder, returning 500 with
    // an unhelpful "Cannot read properties of undefined" message.
    if (!body.riskLevel) throw new ValidationError('riskLevel is required');
    if (!Array.isArray(body.dimensions)) {
      throw new ValidationError('dimensions must be an array');
    }
    const result = await generateRecommendations({
      riskLevel: body.riskLevel,
      dimensions: body.dimensions,
      interventionType: body.interventionType,
      availableCourses: body.availableCourses,
      availableGroups: body.availableGroups,
    });
    await logAudit(request, 'ai_call', 'recommendations');
    return result;
  });
}
