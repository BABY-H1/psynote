import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as appointmentService from './appointment.service.js';

export async function appointmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List appointments */
  app.get('/', async (request) => {
    const query = request.query as {
      counselorId?: string;
      clientId?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    return appointmentService.listAppointments(request.org!.orgId, {
      counselorId: query.counselorId,
      clientId: query.clientId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  });

  /** Get a single appointment */
  app.get('/:appointmentId', async (request) => {
    const { appointmentId } = request.params as { appointmentId: string };
    return appointmentService.getAppointmentById(appointmentId);
  });

  /** Create appointment */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      careEpisodeId?: string;
      clientId: string;
      counselorId?: string;
      startTime: string;
      endTime: string;
      type?: string;
      source?: string;
      notes?: string;
    };

    if (!body.clientId) throw new ValidationError('clientId is required');
    if (!body.startTime || !body.endTime) throw new ValidationError('startTime and endTime are required');

    const appointment = await appointmentService.createAppointment({
      orgId: request.org!.orgId,
      careEpisodeId: body.careEpisodeId,
      clientId: body.clientId,
      counselorId: body.counselorId || request.user!.id,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      type: body.type,
      source: body.source,
      notes: body.notes,
    });

    await logAudit(request, 'create', 'appointments', appointment.id);
    return reply.status(201).send(appointment);
  });

  /** Update appointment status */
  app.patch('/:appointmentId/status', async (request) => {
    const { appointmentId } = request.params as { appointmentId: string };
    const body = request.body as { status: string };

    if (!body.status) throw new ValidationError('status is required');

    const updated = await appointmentService.updateAppointmentStatus(
      appointmentId,
      body.status,
      request.user!.id,
    );

    await logAudit(request, 'update', 'appointments', appointmentId);
    return updated;
  });
}
