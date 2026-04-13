import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { rejectClient } from '../../middleware/reject-client.js';
import * as availabilityService from './availability.service.js';

export async function availabilityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  /** List availability slots for a counselor */
  app.get('/', async (request) => {
    const query = request.query as { counselorId?: string };
    const counselorId = query.counselorId || request.user!.id;
    return availabilityService.listAvailability(request.org!.orgId, counselorId);
  });

  /** Get available time windows for a specific date (used by clients for booking) */
  app.get('/slots', async (request) => {
    const query = request.query as { counselorId: string; date: string };

    if (!query.counselorId) throw new ValidationError('counselorId is required');
    if (!query.date) throw new ValidationError('date is required');

    return availabilityService.getAvailableTimeSlots(
      request.org!.orgId,
      query.counselorId,
      query.date,
    );
  });

  /** Create availability slot */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      counselorId?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      sessionType?: string;
    };

    if (body.dayOfWeek === undefined || body.dayOfWeek === null) {
      throw new ValidationError('dayOfWeek is required');
    }
    if (!body.startTime || !body.endTime) {
      throw new ValidationError('startTime and endTime are required');
    }

    const slot = await availabilityService.createSlot({
      orgId: request.org!.orgId,
      counselorId: body.counselorId || request.user!.id,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      sessionType: body.sessionType,
    });

    await logAudit(request, 'create', 'counselor_availability', slot.id);
    return reply.status(201).send(slot);
  });

  /** Update availability slot */
  app.patch('/:slotId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { slotId } = request.params as { slotId: string };
    const body = request.body as {
      startTime?: string;
      endTime?: string;
      sessionType?: string | null;
      isActive?: boolean;
    };

    const updated = await availabilityService.updateSlot(slotId, body);
    await logAudit(request, 'update', 'counselor_availability', slotId);
    return updated;
  });

  /** Delete availability slot */
  app.delete('/:slotId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { slotId } = request.params as { slotId: string };
    await availabilityService.deleteSlot(slotId);
    await logAudit(request, 'delete', 'counselor_availability', slotId);
    return reply.status(204).send();
  });
}
