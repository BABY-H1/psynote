import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { rejectClient } from '../../middleware/reject-client.js';
import * as templateService from './note-template.service.js';

export async function noteTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  /** List all templates (built-in + custom) */
  app.get('/', async (request) => {
    return templateService.listTemplates(request.org!.orgId, request.user!.id);
  });

  /** Create custom template */
  app.post(
    '/',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request, reply) => {
      const body = request.body as {
        title: string;
        format: string;
        fieldDefinitions: unknown[];
        visibility?: string;
        isDefault?: boolean;
      };
      if (!body.title || !body.format || !body.fieldDefinitions?.length) {
        throw new ValidationError('title, format, and fieldDefinitions are required');
      }
      const template = await templateService.createTemplate({
        orgId: request.org!.orgId,
        createdBy: request.user!.id,
        ...body,
      });
      await logAudit(request, 'create', 'note_templates', template.id);
      return reply.status(201).send(template);
    },
  );

  /** Update template */
  app.patch(
    '/:templateId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { templateId } = request.params as { templateId: string };
      const body = request.body as Record<string, unknown>;
      const updated = await templateService.updateTemplate(templateId, body);
      await logAudit(request, 'update', 'note_templates', templateId);
      return updated;
    },
  );

  /** Delete template */
  app.delete(
    '/:templateId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { templateId } = request.params as { templateId: string };
      await templateService.deleteTemplate(templateId);
      await logAudit(request, 'delete', 'note_templates', templateId);
      return { success: true };
    },
  );
}
