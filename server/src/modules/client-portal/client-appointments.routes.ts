import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { appointments } from '../../db/schema.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as appointmentService from '../counseling/appointment.service.js';
import { resolveTargetUserId, rejectAsParam } from './client-portal-shared.js';

/**
 * Client appointment views + self-initiated requests.
 *
 * `/appointments` is guardian-readable.
 * `/appointment-requests` is guardian-blocked — a guardian cannot book on
 * behalf of a child directly (counselor contact flow handles that).
 */
export async function clientAppointmentsRoutes(app: FastifyInstance) {
  /** My appointments — guardian-readable */
  app.get('/appointments', async (request) => {
    const userId = await resolveTargetUserId(request);
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, orgId),
        eq(appointments.clientId, userId),
      ))
      .orderBy(desc(appointments.startTime));
  });

  /** Submit an appointment request (client-initiated) — guardian-blocked */
  app.post('/appointment-requests', async (request, reply) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const body = request.body as {
      counselorId: string;
      startTime: string;
      endTime: string;
      type?: string;
      notes?: string;
    };
    if (!body.counselorId) throw new ValidationError('counselorId is required');
    if (!body.startTime || !body.endTime) {
      throw new ValidationError('startTime and endTime are required');
    }

    const appointment = await appointmentService.createClientRequest({
      orgId,
      clientId: userId,
      counselorId: body.counselorId,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      type: body.type,
      notes: body.notes,
    });

    await logAudit(request, 'create', 'appointments', appointment.id);
    return reply.status(201).send(appointment);
  });
}
