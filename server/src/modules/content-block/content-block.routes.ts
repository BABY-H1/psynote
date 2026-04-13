/**
 * Phase 9α — Content block REST routes.
 *
 * Mounted at /api/orgs/:orgId/content-blocks
 * Unified CRUD for both course chapters and group scheme sessions.
 * Parent discriminator is in the request body or path.
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as service from './content-block.service.js';
import type { ParentType } from './content-block.service.js';
import { rejectClient } from '../../middleware/reject-client.js';

export async function contentBlockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  // ─── List ────────────────────────────────────────────────────────

  /**
   * GET /api/orgs/:orgId/content-blocks?parentType=course&parentId=<chapterId>
   * or  ?parentType=group&parentId=<schemeSessionId>
   */
  app.get('/', async (request) => {
    const q = request.query as { parentType?: string; parentId?: string };
    if (q.parentType !== 'course' && q.parentType !== 'group') {
      throw new ValidationError('parentType must be course or group');
    }
    if (!q.parentId) throw new ValidationError('parentId is required');

    const orgId = request.org!.orgId;
    if (q.parentType === 'course') {
      return service.listBlocksForCourseChapter(q.parentId, orgId);
    } else {
      return service.listBlocksForGroupSession(q.parentId, orgId);
    }
  });

  /**
   * GET /api/orgs/:orgId/content-blocks/batch?parentType=course&parentIds=a,b,c
   * Batch query for efficient course-level hydration (avoids N+1).
   */
  app.get('/batch', async (request) => {
    const q = request.query as { parentType?: string; parentIds?: string };
    if (q.parentType !== 'course' && q.parentType !== 'group') {
      throw new ValidationError('parentType must be course or group');
    }
    const ids = (q.parentIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return [];

    if (q.parentType === 'course') {
      return service.listBlocksForChapters(ids);
    } else {
      return service.listBlocksForSchemeSessions(ids);
    }
  });

  // ─── Create ──────────────────────────────────────────────────────

  /**
   * POST /api/orgs/:orgId/content-blocks
   * body: { parentType, parentId, blockType, visibility?, sortOrder?, payload? }
   */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      parentType?: string;
      parentId?: string;
      blockType?: string;
      visibility?: string;
      sortOrder?: number;
      payload?: unknown;
    };
    if (body.parentType !== 'course' && body.parentType !== 'group') {
      throw new ValidationError('parentType must be course or group');
    }
    if (!body.parentId) throw new ValidationError('parentId is required');
    if (!body.blockType) throw new ValidationError('blockType is required');

    const row = await service.createBlock({
      parentType: body.parentType as ParentType,
      parentId: body.parentId,
      blockType: body.blockType,
      visibility: body.visibility,
      sortOrder: body.sortOrder,
      payload: body.payload,
      createdBy: request.user!.id,
      orgId: request.org!.orgId,
    });

    await logAudit(request, 'create', 'content_blocks', row.id);
    return reply.status(201).send(row);
  });

  // ─── Update ──────────────────────────────────────────────────────

  /**
   * PATCH /api/orgs/:orgId/content-blocks/:blockId?parentType=course
   * body: { payload?, visibility?, sortOrder? }
   */
  app.patch('/:blockId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { blockId } = request.params as { blockId: string };
    const q = request.query as { parentType?: string };
    const body = request.body as {
      payload?: unknown;
      visibility?: string;
      sortOrder?: number;
    };
    if (q.parentType !== 'course' && q.parentType !== 'group') {
      throw new ValidationError('parentType query param must be course or group');
    }
    const row = await service.updateBlock({
      parentType: q.parentType as ParentType,
      blockId,
      orgId: request.org!.orgId,
      payload: body.payload,
      visibility: body.visibility,
      sortOrder: body.sortOrder,
    });
    await logAudit(request, 'update', 'content_blocks', blockId);
    return row;
  });

  // ─── Delete ──────────────────────────────────────────────────────

  /** DELETE /api/orgs/:orgId/content-blocks/:blockId?parentType=course */
  app.delete('/:blockId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const q = request.query as { parentType?: string };
    if (q.parentType !== 'course' && q.parentType !== 'group') {
      throw new ValidationError('parentType query param must be course or group');
    }
    await service.deleteBlock(q.parentType as ParentType, blockId, request.org!.orgId);
    await logAudit(request, 'delete', 'content_blocks', blockId);
    return reply.status(204).send();
  });

  // ─── Reorder ─────────────────────────────────────────────────────

  /**
   * POST /api/orgs/:orgId/content-blocks/reorder
   * body: { parentType, parentId, orderedIds: string[] }
   */
  app.post('/reorder', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      parentType?: string;
      parentId?: string;
      orderedIds?: string[];
    };
    if (body.parentType !== 'course' && body.parentType !== 'group') {
      throw new ValidationError('parentType must be course or group');
    }
    if (!body.parentId) throw new ValidationError('parentId is required');
    if (!Array.isArray(body.orderedIds)) throw new ValidationError('orderedIds must be an array');

    await service.reorderBlocks(
      body.parentType as ParentType,
      body.parentId,
      body.orderedIds,
      request.org!.orgId,
    );
    return reply.status(204).send();
  });
}
