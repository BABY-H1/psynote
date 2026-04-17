/**
 * Crisis handling case — HTTP routes (Phase 13).
 *
 * Mounted under /api/orgs/:orgId/crisis:
 *   GET    /cases                      list cases (filter ?stage=)
 *   GET    /cases/:caseId              case detail
 *   GET    /cases/by-episode/:episodeId  look up by episode (for EpisodeDetail UI)
 *   PUT    /cases/:caseId/checklist/:stepKey  update one checklist step
 *   POST   /cases/:caseId/submit       submit for supervisor sign-off
 *   POST   /cases/:caseId/sign-off     supervisor approves or bounces
 *
 * Candidate accept (which atomically creates the case) lives in the workflow
 * module — it's the entry point and needs to stay there.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../lib/validate.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as crisisService from './crisis-case.service.js';
import type { CrisisChecklistStepKey, CrisisCaseStage } from '@psynote/shared';

const STEP_KEYS: CrisisChecklistStepKey[] = [
  'reinterview', 'parentContact', 'documents', 'referral', 'followUp',
];

const StepPayloadSchema = z.object({
  done: z.boolean().optional(),
  completedAt: z.string().optional().nullable(),
  skipped: z.boolean().optional(),
  skipReason: z.string().optional(),
  // reinterview
  noteId: z.string().uuid().optional(),
  summary: z.string().optional(),
  // parentContact
  method: z.enum(['phone', 'wechat', 'in_person', 'other']).optional(),
  contactName: z.string().optional(),
  contactedAt: z.string().optional(),
  // documents
  documentIds: z.array(z.string().uuid()).optional(),
  // referral / followUp
  referralId: z.string().uuid().optional(),
  followUpId: z.string().uuid().optional(),
}).passthrough();

const SubmitBody = z.object({
  closureSummary: z.string().min(1, '请填写结案摘要'),
});

const SignOffBody = z.object({
  approve: z.boolean(),
  supervisorNote: z.string().optional(),
});

export async function crisisRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /**
   * Phase 14b — Org-level crisis dashboard stats.
   * Available to counselor + org_admin (supervisors are counselors with
   * fullPracticeAccess; we don't gate per-flag here because the data is
   * aggregate, not patient PHI).
   */
  app.get('/stats', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    return crisisService.getDashboardStats(request.org!.orgId);
  });

  // List cases (supervisors filter by stage=pending_sign_off)
  app.get('/cases', async (request) => {
    const orgId = request.org!.orgId;
    const { stage } = request.query as { stage?: string };
    return crisisService.listCases(orgId, { stage: stage as CrisisCaseStage | undefined });
  });

  // Get by id
  app.get('/cases/:caseId', async (request) => {
    const orgId = request.org!.orgId;
    const { caseId } = request.params as { caseId: string };
    return crisisService.getCaseById(orgId, caseId);
  });

  // Get by episode (main entry point from EpisodeDetail UI)
  app.get('/cases/by-episode/:episodeId', async (request) => {
    const orgId = request.org!.orgId;
    const { episodeId } = request.params as { episodeId: string };
    const result = await crisisService.getCaseByEpisode(orgId, episodeId);
    return result || null;
  });

  // Update a checklist step
  app.put('/cases/:caseId/checklist/:stepKey', {
    preHandler: [requireRole('org_admin', 'counselor')],
    handler: async (request) => {
      const orgId = request.org!.orgId;
      const { caseId, stepKey } = request.params as { caseId: string; stepKey: string };
      if (!STEP_KEYS.includes(stepKey as CrisisChecklistStepKey)) {
        throw new ValidationError(`未知步骤 ${stepKey}`);
      }

      const payload = validate(StepPayloadSchema, request.body);

      const updated = await crisisService.updateChecklistStep({
        orgId,
        caseId,
        stepKey: stepKey as CrisisChecklistStepKey,
        payload: payload as never,
        userId: request.user!.id,
      });

      await logAudit(request, 'crisis.step.updated', 'crisis_cases', caseId);
      return updated;
    },
  });

  // Submit for supervisor sign-off
  app.post('/cases/:caseId/submit', {
    preHandler: [requireRole('org_admin', 'counselor')],
    handler: async (request) => {
      const orgId = request.org!.orgId;
      const { caseId } = request.params as { caseId: string };
      const body = validate(SubmitBody, request.body);

      const updated = await crisisService.submitForSignOff({
        orgId,
        caseId,
        closureSummary: body.closureSummary,
        userId: request.user!.id,
      });

      await logAudit(request, 'crisis.submitted_for_sign_off', 'crisis_cases', caseId);
      return updated;
    },
  });

  // Supervisor sign-off (approve or bounce)
  app.post('/cases/:caseId/sign-off', {
    preHandler: [requireRole('org_admin', 'counselor')], // counselor w/ fullPracticeAccess acts as supervisor
    handler: async (request) => {
      const orgId = request.org!.orgId;
      const { caseId } = request.params as { caseId: string };
      const body = validate(SignOffBody, request.body);

      const updated = await crisisService.signOff({
        orgId,
        caseId,
        approve: body.approve,
        supervisorNote: body.supervisorNote,
        userId: request.user!.id,
      });

      await logAudit(
        request,
        body.approve ? 'crisis.signed_off' : 'crisis.reopened',
        'crisis_cases',
        caseId,
      );
      return updated;
    },
  });
}
