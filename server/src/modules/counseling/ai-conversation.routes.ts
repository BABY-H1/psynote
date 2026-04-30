import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { assertAuthorized } from '../../middleware/authorize.js';
import { db } from '../../config/database.js';
import { careEpisodes } from '../../db/schema.js';
import * as service from './ai-conversation.service.js';

export async function aiConversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** List conversations (filter by episodeId, mode) */
  app.get('/', async (request) => {
    const query = request.query as { careEpisodeId?: string; mode?: string };
    return service.listConversations(request.org!.orgId, {
      ...query,
      counselorId: request.user!.id,
      scope: request.dataScope,
    });
  });

  /** Get a single conversation */
  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const conv = await service.getConversation(id);

    // Phase 1.5: AI conversations 含逐字稿,phi_full。clinic_admin 默认禁。
    // ownerUserId 取自该 conversation 关联的 careEpisode.clientId。
    let ownerUserId: string | null = null;
    if (conv.careEpisodeId) {
      const [ep] = await db
        .select({ clientId: careEpisodes.clientId })
        .from(careEpisodes)
        .where(eq(careEpisodes.id, conv.careEpisodeId))
        .limit(1);
      ownerUserId = ep?.clientId ?? null;
    }
    assertAuthorized(request, 'view', {
      type: 'ai_conversation',
      dataClass: 'phi_full',
      ownerUserId,
    });

    return conv;
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
      // Phase I Issue 1: bind/unbind to sessionNote (mode='note' workflow)
      sessionNoteId?: string | null;
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
