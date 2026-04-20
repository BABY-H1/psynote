import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { assertLibraryItemOwnedByOrg } from '../../middleware/library-ownership.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { consentTemplates } from '../../db/schema.js';
import * as consentService from './consent.service.js';

export async function consentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  // ─── Templates (counselor/admin) ────────────────────────────

  app.get('/consent-templates', async (request) => {
    return consentService.listTemplates(request.org!.orgId);
  });

  app.post(
    '/consent-templates',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request, reply) => {
      const body = request.body as {
        title: string;
        consentType: string;
        content: string;
      };
      if (!body.title || !body.consentType || !body.content) {
        throw new ValidationError('title, consentType, and content are required');
      }
      const template = await consentService.createTemplate({
        orgId: request.org!.orgId,
        createdBy: request.user!.id,
        ...body,
      });
      await logAudit(request, 'create', 'consent_templates', template.id);
      return reply.status(201).send(template);
    },
  );

  app.patch(
    '/consent-templates/:templateId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { templateId } = request.params as { templateId: string };
      await assertLibraryItemOwnedByOrg(consentTemplates, templateId, request.org!.orgId);
      const body = request.body as Record<string, unknown>;
      const updated = await consentService.updateTemplate(templateId, body);
      await logAudit(request, 'update', 'consent_templates', templateId);
      return updated;
    },
  );

  app.delete(
    '/consent-templates/:templateId',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request) => {
      const { templateId } = request.params as { templateId: string };
      await assertLibraryItemOwnedByOrg(consentTemplates, templateId, request.org!.orgId);
      await consentService.deleteTemplate(templateId);
      await logAudit(request, 'delete', 'consent_templates', templateId);
      return { success: true };
    },
  );

  // ─── Documents (counselor/admin) ────────────────────────────

  app.post(
    '/consent-documents',
    { preHandler: [requireRole('org_admin', 'counselor')] },
    async (request, reply) => {
      const body = request.body as {
        clientId: string;
        careEpisodeId?: string;
        templateId: string;
        recipientType?: 'client' | 'guardian';
        recipientName?: string;
      };
      if (!body.clientId || !body.templateId) {
        throw new ValidationError('clientId and templateId are required');
      }
      if (body.recipientType && !['client', 'guardian'].includes(body.recipientType)) {
        throw new ValidationError('recipientType 必须是 client 或 guardian');
      }
      if (body.recipientType === 'guardian' && !body.recipientName?.trim()) {
        throw new ValidationError('发给家长/监护人时,recipientName 必填');
      }
      const doc = await consentService.sendConsentToClient({
        orgId: request.org!.orgId,
        createdBy: request.user!.id,
        ...body,
      });
      await logAudit(request, 'create', 'client_documents', doc.id);
      return reply.status(201).send(doc);
    },
  );

  app.get('/consent-documents', async (request) => {
    const query = request.query as { clientId?: string; status?: string; careEpisodeId?: string };
    return consentService.listDocuments(request.org!.orgId, query);
  });

  app.get('/consent-documents/:docId', async (request) => {
    const { docId } = request.params as { docId: string };
    return consentService.getDocumentById(docId);
  });
}
