import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { interpretResult } from './pipelines/interpretation.js';
import { assessRisk } from './pipelines/risk-detection.js';
import { recommendTriage } from './pipelines/triage.js';
import { analyzeSOAP } from './pipelines/soap-analysis.js';
import { generateProgressReport } from './pipelines/progress-report.js';
import { generateReferralSummary } from './pipelines/referral-summary.js';

/**
 * Assessment-oriented AI routes: interpretation, risk, triage, session
 * analysis, longitudinal progress, referral summary.
 */
export async function aiAssessmentRoutes(app: FastifyInstance) {
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
    const result = await assessRisk(body, {
      orgId: request.org!.orgId,
      userId: request.user!.id,
      pipeline: 'risk-detection',
    });
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

    const recommendation = await recommendTriage(
      {
        ...body,
        availableInterventions: body.availableInterventions || ['course', 'group', 'counseling', 'referral'],
      },
      {
        orgId: request.org!.orgId,
        userId: request.user!.id,
        pipeline: 'triage',
      },
    );
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
}
