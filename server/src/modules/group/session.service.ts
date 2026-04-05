import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  groupSessionRecords, groupSessionAttendance,
  groupSchemeSessions, groupEnrollments, users,
  groupInstances,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listSessionRecords(instanceId: string) {
  const records = await db
    .select()
    .from(groupSessionRecords)
    .where(eq(groupSessionRecords.instanceId, instanceId))
    .orderBy(asc(groupSessionRecords.sessionNumber));

  // Get attendance counts per session
  const attendanceCounts = await db
    .select({
      sessionRecordId: groupSessionAttendance.sessionRecordId,
      presentCount: sql<number>`count(*) filter (where ${groupSessionAttendance.status} = 'present' or ${groupSessionAttendance.status} = 'late')`,
      totalCount: sql<number>`count(*)`,
    })
    .from(groupSessionAttendance)
    .where(
      sql`${groupSessionAttendance.sessionRecordId} in (${sql.join(
        records.map((r) => sql`${r.id}`),
        sql`, `,
      )})`,
    )
    .groupBy(groupSessionAttendance.sessionRecordId);

  const countMap = new Map(attendanceCounts.map((c) => [c.sessionRecordId, c]));

  return records.map((r) => ({
    ...r,
    attendanceCount: countMap.get(r.id)?.presentCount || 0,
    totalAttendance: countMap.get(r.id)?.totalCount || 0,
  }));
}

export async function getSessionRecordById(sessionId: string) {
  const [record] = await db
    .select()
    .from(groupSessionRecords)
    .where(eq(groupSessionRecords.id, sessionId))
    .limit(1);

  if (!record) throw new NotFoundError('GroupSessionRecord', sessionId);

  // Get attendance with user info
  const attendance = await db
    .select({
      attendance: groupSessionAttendance,
      enrollmentId: groupEnrollments.id,
      userId: groupEnrollments.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(groupSessionAttendance)
    .innerJoin(groupEnrollments, eq(groupEnrollments.id, groupSessionAttendance.enrollmentId))
    .leftJoin(users, eq(users.id, groupEnrollments.userId))
    .where(eq(groupSessionAttendance.sessionRecordId, sessionId));

  return {
    ...record,
    attendance: attendance.map((a) => ({
      ...a.attendance,
      user: { id: a.userId, name: a.userName, email: a.userEmail },
    })),
  };
}

export async function initializeSessionRecords(instanceId: string) {
  // Get the instance to find schemeId
  const [instance] = await db
    .select()
    .from(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .limit(1);

  if (!instance) throw new NotFoundError('GroupInstance', instanceId);
  if (!instance.schemeId) {
    throw new Error('Instance has no associated scheme');
  }

  // Check if records already exist
  const existing = await db
    .select()
    .from(groupSessionRecords)
    .where(eq(groupSessionRecords.instanceId, instanceId))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('Session records already initialized');
  }

  // Get scheme sessions
  const schemeSessions = await db
    .select()
    .from(groupSchemeSessions)
    .where(eq(groupSchemeSessions.schemeId, instance.schemeId))
    .orderBy(asc(groupSchemeSessions.sortOrder));

  if (schemeSessions.length === 0) return [];

  // Create session records
  const records = await db.insert(groupSessionRecords).values(
    schemeSessions.map((s, idx) => ({
      instanceId,
      schemeSessionId: s.id,
      sessionNumber: idx + 1,
      title: s.title,
      status: 'planned' as const,
    })),
  ).returning();

  return records;
}

export async function createSessionRecord(input: {
  instanceId: string;
  title: string;
  sessionNumber: number;
  date?: string;
}) {
  const [record] = await db.insert(groupSessionRecords).values({
    instanceId: input.instanceId,
    sessionNumber: input.sessionNumber,
    title: input.title,
    date: input.date,
    status: 'planned',
  }).returning();

  return record;
}

export async function updateSessionRecord(
  sessionId: string,
  updates: Partial<{
    status: string;
    date: string;
    notes: string;
    title: string;
  }>,
) {
  const [updated] = await db
    .update(groupSessionRecords)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(groupSessionRecords.id, sessionId))
    .returning();

  if (!updated) throw new NotFoundError('GroupSessionRecord', sessionId);
  return updated;
}

export async function recordAttendance(
  sessionRecordId: string,
  attendances: { enrollmentId: string; status: string; note?: string }[],
) {
  // Upsert attendance records
  const results = [];
  for (const att of attendances) {
    const [existing] = await db
      .select()
      .from(groupSessionAttendance)
      .where(
        and(
          eq(groupSessionAttendance.sessionRecordId, sessionRecordId),
          eq(groupSessionAttendance.enrollmentId, att.enrollmentId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(groupSessionAttendance)
        .set({ status: att.status, note: att.note || null })
        .where(eq(groupSessionAttendance.id, existing.id))
        .returning();
      results.push(updated);
    } else {
      const [created] = await db
        .insert(groupSessionAttendance)
        .values({
          sessionRecordId,
          enrollmentId: att.enrollmentId,
          status: att.status,
          note: att.note || null,
        })
        .returning();
      results.push(created);
    }
  }

  return results;
}

export async function getAttendanceSummary(instanceId: string) {
  // Get all session records for this instance
  const records = await db
    .select({ id: groupSessionRecords.id })
    .from(groupSessionRecords)
    .where(
      and(
        eq(groupSessionRecords.instanceId, instanceId),
        eq(groupSessionRecords.status, 'completed'),
      ),
    );

  if (records.length === 0) return {};

  // Get attendance grouped by enrollment
  const attendance = await db
    .select({
      enrollmentId: groupSessionAttendance.enrollmentId,
      status: groupSessionAttendance.status,
    })
    .from(groupSessionAttendance)
    .where(
      sql`${groupSessionAttendance.sessionRecordId} in (${sql.join(
        records.map((r) => sql`${r.id}`),
        sql`, `,
      )})`,
    );

  // Build summary per enrollment
  const summary: Record<string, { present: number; total: number }> = {};
  for (const a of attendance) {
    if (!summary[a.enrollmentId]) {
      summary[a.enrollmentId] = { present: 0, total: 0 };
    }
    summary[a.enrollmentId].total++;
    if (a.status === 'present' || a.status === 'late') {
      summary[a.enrollmentId].present++;
    }
  }

  return summary;
}
