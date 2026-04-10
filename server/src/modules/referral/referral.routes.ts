import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as referralService from './referral.service.js';

export async function referralRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** List referrals */
  app.get('/', async (request) => {
    const query = request.query as { careEpisodeId?: string };
    return referralService.listReferrals(request.org!.orgId, query.careEpisodeId, request.dataScope);
  });

  /** Get a single referral */
  app.get('/:referralId', async (request) => {
    const { referralId } = request.params as { referralId: string };
    return referralService.getReferralById(referralId);
  });

  /** Create a referral */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId: string;
      clientId: string;
      reason: string;
      riskSummary?: string;
      targetType?: string;
      targetName?: string;
      targetContact?: string;
      followUpPlan?: string;
    };

    if (!body.careEpisodeId) throw new ValidationError('careEpisodeId is required');
    if (!body.clientId) throw new ValidationError('clientId is required');
    if (!body.reason) throw new ValidationError('reason is required');

    const referral = await referralService.createReferral({
      orgId: request.org!.orgId,
      careEpisodeId: body.careEpisodeId,
      clientId: body.clientId,
      referredBy: request.user!.id,
      reason: body.reason,
      riskSummary: body.riskSummary,
      targetType: body.targetType,
      targetName: body.targetName,
      targetContact: body.targetContact,
      followUpPlan: body.followUpPlan,
    });

    await logAudit(request, 'create', 'referrals', referral.id);
    return reply.status(201).send(referral);
  });

  /** Update referral (status, follow-up notes) */
  app.patch('/:referralId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { referralId } = request.params as { referralId: string };
    const body = request.body as Partial<{
      status: string;
      followUpNotes: string;
      targetName: string;
      targetContact: string;
    }>;

    const updated = await referralService.updateReferral(referralId, body);
    await logAudit(request, 'update', 'referrals', referralId);
    return updated;
  });

  // ─── Phase 9δ — Bidirectional flow ─────────────────────────────

  /**
   * POST /api/orgs/:orgId/referrals/extended
   * Create a referral with explicit data package + mode (platform | external).
   */
  app.post('/extended', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId?: string;
      clientId?: string;
      reason?: string;
      riskSummary?: string;
      mode?: 'platform' | 'external';
      toCounselorId?: string;
      toOrgId?: string;
      targetType?: string;
      targetName?: string;
      targetContact?: string;
      dataPackageSpec?: referralService.DataPackageSpec;
    };

    if (!body.careEpisodeId) throw new ValidationError('careEpisodeId is required');
    if (!body.clientId) throw new ValidationError('clientId is required');
    if (!body.reason) throw new ValidationError('reason is required');
    if (body.mode !== 'platform' && body.mode !== 'external') {
      throw new ValidationError('mode must be platform or external');
    }

    const referral = await referralService.createReferralExtended({
      orgId: request.org!.orgId,
      careEpisodeId: body.careEpisodeId,
      clientId: body.clientId,
      referredBy: request.user!.id,
      reason: body.reason,
      riskSummary: body.riskSummary,
      mode: body.mode,
      toCounselorId: body.toCounselorId,
      toOrgId: body.toOrgId,
      targetType: body.targetType,
      targetName: body.targetName,
      targetContact: body.targetContact,
      dataPackageSpec: body.dataPackageSpec ?? {},
    });

    await logAudit(request, 'create', 'referrals', referral.id);
    return reply.status(201).send(referral);
  });

  /** Receiver inbox: referrals where the caller is the to_counselor and client has consented. */
  app.get('/inbox', async (request) => {
    return referralService.listIncomingReferrals(request.user!.id);
  });

  /**
   * Receiver decision: accept or reject after the client has consented.
   * POST /api/orgs/:orgId/referrals/:referralId/respond
   * body: { decision: 'accept' | 'reject', reason? }
   */
  app.post('/:referralId/respond', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { referralId } = request.params as { referralId: string };
    const body = request.body as { decision?: 'accept' | 'reject'; reason?: string };
    if (body.decision !== 'accept' && body.decision !== 'reject') {
      throw new ValidationError('decision must be accept or reject');
    }

    const updated = await referralService.respondToReferral(
      referralId,
      request.user!.id,
      body.decision,
      body.reason,
    );
    await logAudit(request, 'update', 'referrals', referralId);
    return updated;
  });

  /** Resolve and return the data package for a referral (counselor side, view-only). */
  app.get('/:referralId/data-package', async (request) => {
    const { referralId } = request.params as { referralId: string };
    return referralService.resolveDataPackage(referralId);
  });
}
