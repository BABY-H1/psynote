import { eq, and, desc, gte, lte, lt, gt, ne, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { appointments, careTimeline, users } from '../../db/schema.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import { getAvailableTimeSlots } from './availability.service.js';

export async function listAppointments(
  orgId: string,
  filters?: {
    counselorId?: string;
    clientId?: string;
    status?: string;
    from?: Date;
    to?: Date;
  },
) {
  const conditions = [eq(appointments.orgId, orgId)];
  if (filters?.counselorId) conditions.push(eq(appointments.counselorId, filters.counselorId));
  if (filters?.clientId) conditions.push(eq(appointments.clientId, filters.clientId));
  if (filters?.status) conditions.push(eq(appointments.status, filters.status));
  if (filters?.from) conditions.push(gte(appointments.startTime, filters.from));
  if (filters?.to) conditions.push(lte(appointments.startTime, filters.to));

  return db
    .select({
      appointment: appointments,
      clientName: users.name,
    })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.clientId))
    .where(and(...conditions))
    .orderBy(desc(appointments.startTime));
}

export async function getAppointmentById(appointmentId: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row) throw new NotFoundError('Appointment', appointmentId);
  return row;
}

export async function createAppointment(input: {
  orgId: string;
  careEpisodeId?: string;
  clientId: string;
  counselorId: string;
  startTime: Date;
  endTime: Date;
  type?: string;
  source?: string;
  notes?: string;
}) {
  const [appointment] = await db.insert(appointments).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId || null,
    clientId: input.clientId,
    counselorId: input.counselorId,
    startTime: input.startTime,
    endTime: input.endTime,
    type: input.type,
    source: input.source || 'counselor_manual',
    notes: input.notes,
  }).returning();

  // Add to episode timeline if linked
  if (input.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'appointment',
      refId: appointment.id,
      title: '新预约已创建',
      summary: `${input.type || '咨询'} | ${input.startTime.toLocaleDateString('zh-CN')}`,
      metadata: { startTime: input.startTime, endTime: input.endTime, type: input.type },
      createdBy: input.counselorId,
    });
  }

  return appointment;
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: string,
  updatedBy?: string,
) {
  const [updated] = await db
    .update(appointments)
    .set({ status })
    .where(eq(appointments.id, appointmentId))
    .returning();

  if (!updated) throw new NotFoundError('Appointment', appointmentId);

  // Update timeline if linked to episode
  if (updated.careEpisodeId) {
    const statusLabels: Record<string, string> = {
      confirmed: '预约已确认',
      completed: '预约已完成',
      cancelled: '预约已取消',
      no_show: '来访者未到',
    };
    await db.insert(careTimeline).values({
      careEpisodeId: updated.careEpisodeId,
      eventType: 'appointment',
      refId: updated.id,
      title: statusLabels[status] || `预约状态变更: ${status}`,
      createdBy: updatedBy || null,
    });
  }

  return updated;
}

/** Check if a counselor has conflicting appointments in the given time range */
export async function checkConflict(
  counselorId: string,
  startTime: Date,
  endTime: Date,
  excludeId?: string,
) {
  const conditions = [
    eq(appointments.counselorId, counselorId),
    lt(appointments.startTime, endTime),
    gt(appointments.endTime, startTime),
    inArray(appointments.status, ['pending', 'confirmed']),
  ];
  if (excludeId) conditions.push(ne(appointments.id, excludeId));

  const [conflict] = await db
    .select()
    .from(appointments)
    .where(and(...conditions))
    .limit(1);

  return conflict || null;
}

/** Create an appointment request from a client (C-end) */
export async function createClientRequest(input: {
  orgId: string;
  clientId: string;
  counselorId: string;
  startTime: Date;
  endTime: Date;
  type?: string;
  notes?: string;
}) {
  // Validate the requested time falls within an available slot
  const dateStr = input.startTime.toISOString().slice(0, 10);
  const freeSlots = await getAvailableTimeSlots(input.orgId, input.counselorId, dateStr);

  const reqStart = `${String(input.startTime.getHours()).padStart(2, '0')}:${String(input.startTime.getMinutes()).padStart(2, '0')}`;
  const reqEnd = `${String(input.endTime.getHours()).padStart(2, '0')}:${String(input.endTime.getMinutes()).padStart(2, '0')}`;

  const fits = freeSlots.some((s) => s.start <= reqStart && s.end >= reqEnd);
  if (!fits) {
    throw new ValidationError('所选时段不在咨询师可用时间范围内');
  }

  // Check conflict
  const conflict = await checkConflict(input.counselorId, input.startTime, input.endTime);
  if (conflict) {
    throw new ConflictError('该时段已被预约');
  }

  // Create appointment
  const [appointment] = await db.insert(appointments).values({
    orgId: input.orgId,
    clientId: input.clientId,
    counselorId: input.counselorId,
    startTime: input.startTime,
    endTime: input.endTime,
    type: input.type,
    source: 'client_request',
    status: 'pending',
    notes: input.notes,
  }).returning();

  return appointment;
}
