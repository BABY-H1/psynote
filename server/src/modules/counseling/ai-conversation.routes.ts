import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import * as service from './ai-conversation.service.js';

export async function aiConversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List conversations (filter by episodeId, mode) */
  app.get('/', async (request) => {
    const query = request.query as { careEpisodeId?: string; mode?: string };
    return service.listConversations(request.org!.orgId, {
      ...query,
      counselorId: request.user!.id,
    });
  });

  /** Get a single conversation */
  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return service.getConversation(id);
  });

  /** Create a new conversation */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId: string;
      mode: string;
      title?: string;
    };
    const row = await service.createConversation({
      orgId: request.org!.orgId,
      counselorId: request.user!.id,
      careEpisodeId: body.careEpisodeId,
      mode: body.mode,
      title: body.title,
    });
    reply.code(201);
    return row;
  });

  /** Update conversation (append messages, edit title) */
  app.patch('/:id', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      messages?: any[];
      title?: string;
      summary?: string;
    };
    return service.updateConversation(id, body);
  });

  /** Delete conversation */
  app.delete('/:id', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return service.deleteConversation(id);
  });
}
