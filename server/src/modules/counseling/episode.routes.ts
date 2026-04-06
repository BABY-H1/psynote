import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole, requireClinicalAccess } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { validate } from '../../lib/validate.js';
import * as episodeService from './episode.service.js';

// ─── Schemas ────────────────────────────────────────────────────────
const ListEpisodesQuery = z.object({
  counselorId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  status: z.string().optional(),
});

const CreateEpisodeBody = z.object({
  clientId: z.string().uuid(),
  counselorId: z.string().uuid().optional(),
  chiefComplaint: z.string().optional(),
  currentRisk: z.string().optional(),
  interventionType: z.string().optional(),
});

const UpdateEpisodeBody = z.object({
  counselorId: z.string().uuid().optional(),
  status: z.string().optional(),
  chiefComplaint: z.string().optional(),
  currentRisk: z.string().optional(),
  interventionType: z.string().optional(),
}).partial();

const TriageBody = z.object({
  currentRisk: z.string().min(1),
  interventionType: z.string().min(1),
  note: z.string().optional(),
});

const CloseBody = z.object({
  reason: z.string().optional(),
}).optional();

const EpisodeIdParam = z.object({ episodeId: z.string().uuid() });

export async function episodeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);
  app.addHook('preHandler', requireClinicalAccess());

  /** List episodes with optional filters */
  app.get('/', async (request) => {
    const query = validate(ListEpisodesQuery, request.query);
    return episodeService.listEpisodes(request.org!.orgId, { ...query, scope: request.dataScope });
  });

  /** Get a single episode */
  app.get('/:episodeId', async (request) => {
    const { episodeId } = validate(EpisodeIdParam, request.params);
    const episode = await episodeService.getEpisodeById(episodeId);

    await logPhiAccess(request, episode.clientId, 'care_episodes', 'view', episode.id);
    return episode;
  });

  /** Get episode timeline */
  app.get('/:episodeId/timeline', async (request) => {
    const { episodeId } = validate(EpisodeIdParam, request.params);
    return episodeService.getTimeline(episodeId);
  });

  /** Create a new episode */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = validate(CreateEpisodeBody, request.body);

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
    const { episodeId } = validate(EpisodeIdParam, request.params);
    const body = validate(UpdateEpisodeBody, request.body);

    const updated = await episodeService.updateEpisode(episodeId, body);
    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });

  /** Confirm triage decision */
  app.patch('/:episodeId/triage', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = validate(EpisodeIdParam, request.params);
    const body = validate(TriageBody, request.body);

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
    const { episodeId } = validate(EpisodeIdParam, request.params);
    const body = validate(CloseBody, request.body);

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
    const { episodeId } = validate(EpisodeIdParam, request.params);
    const updated = await episodeService.reopenEpisode(episodeId, request.user!.id);
    await logAudit(request, 'update', 'care_episodes', episodeId);
    return updated;
  });
}
