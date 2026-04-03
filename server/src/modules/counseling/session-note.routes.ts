import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as sessionNoteService from './session-note.service.js';

export async function sessionNoteRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List session notes */
  app.get('/', async (request) => {
    const query = request.query as {
      counselorId?: string;
      clientId?: string;
      careEpisodeId?: string;
    };
    return sessionNoteService.listSessionNotes(request.org!.orgId, query);
  });

  /** Get a single session note */
  app.get('/:noteId', async (request) => {
    const { noteId } = request.params as { noteId: string };
    const note = await sessionNoteService.getSessionNoteById(noteId);

    await logPhiAccess(request, note.clientId, 'session_notes', 'view', note.id);
    return note;
  });

  /** Create a session note (multi-format) */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId?: string;
      appointmentId?: string;
      clientId: string;
      noteFormat?: string;
      templateId?: string;
      sessionDate: string;
      duration?: number;
      sessionType?: string;
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
      fields?: Record<string, string>;
      summary?: string;
      tags?: string[];
    };

    if (!body.clientId) throw new ValidationError('clientId is required');
    if (!body.sessionDate) throw new ValidationError('sessionDate is required');

    const note = await sessionNoteService.createSessionNote({
      orgId: request.org!.orgId,
      careEpisodeId: body.careEpisodeId,
      appointmentId: body.appointmentId,
      clientId: body.clientId,
      counselorId: request.user!.id,
      noteFormat: body.noteFormat,
      templateId: body.templateId,
      sessionDate: body.sessionDate,
      duration: body.duration,
      sessionType: body.sessionType,
      subjective: body.subjective,
      objective: body.objective,
      assessment: body.assessment,
      plan: body.plan,
      fields: body.fields,
      summary: body.summary,
      tags: body.tags,
    });

    await logAudit(request, 'create', 'session_notes', note.id);
    return reply.status(201).send(note);
  });

  /** Update a session note */
  app.patch('/:noteId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { noteId } = request.params as { noteId: string };
    const body = request.body as Partial<{
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
      fields: Record<string, string>;
      summary: string;
      tags: string[];
    }>;

    const updated = await sessionNoteService.updateSessionNote(noteId, body);
    await logAudit(request, 'update', 'session_notes', noteId);
    return updated;
  });
}
