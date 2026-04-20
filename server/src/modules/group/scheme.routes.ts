import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { assertLibraryItemOwnedByOrg } from '../../middleware/library-ownership.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { groupSchemes } from '../../db/schema.js';
import * as schemeService from './scheme.service.js';

export async function schemeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  app.get('/', async (request) => {
    return schemeService.listSchemes(request.org!.orgId, request.user!.id);
  });

  app.get('/:schemeId', async (request) => {
    const { schemeId } = request.params as { schemeId: string };
    return schemeService.getSchemeById(schemeId);
  });

  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as any;
    if (!body.title) throw new ValidationError('title is required');

    const scheme = await schemeService.createScheme({
      orgId: request.org!.orgId,
      createdBy: request.user!.id,
      ...body,
    });

    await logAudit(request, 'create', 'group_schemes', scheme.id);
    return reply.status(201).send(scheme);
  });

  app.patch('/:schemeId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { schemeId } = request.params as { schemeId: string };
    await assertLibraryItemOwnedByOrg(groupSchemes, schemeId, request.org!.orgId);
    const { sessions, ...schemeUpdates } = request.body as any;

    const updated = await schemeService.updateScheme(schemeId, schemeUpdates, sessions);
    await logAudit(request, 'update', 'group_schemes', schemeId);
    return updated;
  });

  app.delete('/:schemeId', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const { schemeId } = request.params as { schemeId: string };
    await assertLibraryItemOwnedByOrg(groupSchemes, schemeId, request.org!.orgId);
    await schemeService.deleteScheme(schemeId);
    await logAudit(request, 'delete', 'group_schemes', schemeId);
    return reply.status(204).send();
  });
}
