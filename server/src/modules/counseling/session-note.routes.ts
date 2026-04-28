import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { assertAuthorized } from '../../middleware/authorize.js';
import { logAudit, logPhiAccess } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as sessionNoteService from './session-note.service.js';

export async function sessionNoteRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** List session notes */
  app.get('/', async (request) => {
    const query = request.query as {
      counselorId?: string;
      clientId?: string;
      careEpisodeId?: string;
    };
    return sessionNoteService.listSessionNotes(request.org!.orgId, { ...query, scope: request.dataScope });
  });

  /** Get a single session note */
  app.get('/:noteId', async (request) => {
    const { noteId } = request.params as { noteId: string };
    const note = await sessionNoteService.getSessionNoteById(noteId);

    // Phase 1.5 严格合规: session_notes 是 phi_full,clinic_admin 默认禁读,
    // 走 access_profile 单点开通(在 org-context.ts 已合并到 allowedDataClasses)。
    assertAuthorized(request, 'view', {
      type: 'session_note',
      dataClass: 'phi_full',
      ownerUserId: note.clientId,
    });

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

    // Phase 1.5: edit 也是 phi_full 操作,clinic_admin 默认禁。先取出 note
    // 拿 ownerUserId 再走 authorize。多 1 个 SELECT 是合规代价。
    const existing = await sessionNoteService.getSessionNoteById(noteId);
    assertAuthorized(request, 'edit', {
      type: 'session_note',
      dataClass: 'phi_full',
      ownerUserId: existing.clientId,
    });

    const updated = await sessionNoteService.updateSessionNote(noteId, body);
    await logAudit(request, 'update', 'session_notes', noteId);
    return updated;
  });
}
