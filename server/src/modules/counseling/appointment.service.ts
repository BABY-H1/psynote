import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { appointments, careTimeline, users } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

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
