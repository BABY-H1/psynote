import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as sessionService from './session.service.js';

export async function sessionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List session records for an instance */
  app.get('/:instanceId/sessions', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return sessionService.listSessionRecords(instanceId);
  });

  /** Get a single session record with attendance */
  app.get('/:instanceId/sessions/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return sessionService.getSessionRecordById(sessionId);
  });

  /** Initialize session records from scheme */
  app.post('/:instanceId/sessions/init', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const records = await sessionService.initializeSessionRecords(instanceId);
    await logAudit(request, 'create', 'group_session_records', instanceId);
    return reply.status(201).send(records);
  });

  /** Create a single session record (ad-hoc) */
  app.post('/:instanceId/sessions', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      title: string;
      sessionNumber: number;
      date?: string;
    };
    if (!body.title) throw new ValidationError('title is required');
    if (!body.sessionNumber) throw new ValidationError('sessionNumber is required');

    const record = await sessionService.createSessionRecord({
      instanceId,
      ...body,
    });
    await logAudit(request, 'create', 'group_session_records', record.id);
    return reply.status(201).send(record);
  });

  /** Update a session record (status, date, notes) */
  app.patch('/:instanceId/sessions/:sessionId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as Partial<{
      status: string;
      date: string;
      notes: string;
      title: string;
    }>;

    const updated = await sessionService.updateSessionRecord(sessionId, body);
    await logAudit(request, 'update', 'group_session_records', sessionId);
    return updated;
  });

  /** Record attendance for a session */
  app.post('/:instanceId/sessions/:sessionId/attendance', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      attendances: { enrollmentId: string; status: string; note?: string }[];
    };

    if (!body.attendances || !Array.isArray(body.attendances)) {
      throw new ValidationError('attendances array is required');
    }

    const results = await sessionService.recordAttendance(sessionId, body.attendances);
    await logAudit(request, 'create', 'group_session_attendance', sessionId);
    return results;
  });

  /** Get attendance summary for an instance */
  app.get('/:instanceId/attendance-summary', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return sessionService.getAttendanceSummary(instanceId);
  });
}
