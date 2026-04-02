import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as referralService from './referral.service.js';

export async function referralRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List referrals */
  app.get('/', async (request) => {
    const query = request.query as { careEpisodeId?: string };
    return referralService.listReferrals(request.org!.orgId, query.careEpisodeId);
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
}
