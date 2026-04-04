import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as episodeService from './episode.service.js';

export async function episodeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List episodes with optional filters */
  app.get('/', async (request) => {
    const query = request.query as {
      counselorId?: string;
      clientId?: string;
      status?: string;
    };
    return episodeService.listEpisodes(request.org!.orgId, query);
  });

  /** Get a single episode */
  app.get('/:episodeId', async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const episode = await episodeService.getEpisodeById(episodeId);

    await logPhiAccess(request, episode.clientId, 'care_episodes', 'view', episode.id);
    return episode;
  });

  /** Get episode timeline */
  app.get('/:episodeId/timeline', async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    return episodeService.getTimeline(episodeId);
  });

  /** Create a new episode */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      clientId: string;
      counselorId?: string;
      chiefComplaint?: string;
      currentRisk?: string;
      interventionType?: string;
    };

    if (!body.clientId) throw new ValidationError('clientId is required');

    const episode = await episodeService.createEpisode({
      orgId: request.org!.orgId,
      clientId: body.clientId,
      counselorId: body.counselorId || request.user!.id,
      chiefComplaint: body.chiefComplaint,
      currentRisk: body.currentRisk,
      interventionType: body.interventionType,
    });

    await logAudit(request, 'create', 'care_episodes', episode.id);
    return reply.status(201).send(episode);
  });

  /** Update episode */
  app.patch('/:episodeId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const body = request.body as Partial<{
      counselorId: string;
      status: string;
      chiefComplaint: string;
      currentRisk: string;
      interventionType: string;
    }>;

    const updated = await episodeService.updateEpisode(episodeId, body);
    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });

  /** Confirm triage decision */
  app.patch('/:episodeId/triage', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const body = request.body as {
      currentRisk: string;
      interventionType: string;
      note?: string;
    };

    if (!body.currentRisk) throw new ValidationError('currentRisk is required');
    if (!body.interventionType) throw new ValidationError('interventionType is required');

    const updated = await episodeService.confirmTriage(episodeId, {
      ...body,
      confirmedBy: request.user!.id,
    });

    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });

  /** Close episode */
  app.post('/:episodeId/close', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const body = request.body as { reason?: string } | undefined;

    const updated = await episodeService.closeEpisode(
      episodeId,
      request.user!.id,
      body?.reason,
    );

    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });

  /** Reopen a closed episode */
  app.post('/:episodeId/reopen', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const updated = await episodeService.reopenEpisode(episodeId, request.user!.id);
    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });
}
