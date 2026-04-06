import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { groupInstances, groupEnrollments, groupSchemeSessions, groupSessionRecords, users } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listInstances(orgId: string, status?: string, leaderId?: string, leaderIds?: string[]) {
  const conditions = [eq(groupInstances.orgId, orgId)];
  if (status) conditions.push(eq(groupInstances.status, status));
  if (leaderId) conditions.push(eq(groupInstances.leaderId, leaderId));
  if (leaderIds && leaderIds.length > 0) conditions.push(inArray(groupInstances.leaderId, leaderIds));

  return db
    .select()
    .from(groupInstances)
    .where(and(...conditions))
    .orderBy(desc(groupInstances.createdAt));
}

export async function getInstanceById(instanceId: string) {
  const [instance] = await db
    .select()
    .from(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .limit(1);

  if (!instance) throw new NotFoundError('GroupInstance', instanceId);

  // Get enrollments with user info
  const enrollments = await db
    .select({
      enrollment: groupEnrollments,
      userName: users.name,
      userEmail: users.email,
    })
    .from(groupEnrollments)
    .leftJoin(users, eq(users.id, groupEnrollments.userId))
    .where(eq(groupEnrollments.instanceId, instanceId));

  return {
    ...instance,
    enrollments: enrollments.map((e) => ({
      ...e.enrollment,
      user: { name: e.userName, email: e.userEmail },
    })),
  };
}

export async function createInstance(input: {
  orgId: string;
  schemeId?: string;
  title: string;
  description?: string;
  category?: string;
  leaderId?: string;
  schedule?: string;
  duration?: string;
  startDate?: string;
  location?: string;
  status?: string;
  capacity?: number;
  recruitmentAssessments?: string[];
  overallAssessments?: string[];
  screeningNotes?: string;
  createdBy: string;
}) {
  const [instance] = await db.insert(groupInstances).values({
    orgId: input.orgId,
    schemeId: input.schemeId || null,
    title: input.title,
    description: input.description,
    category: input.category,
    leaderId: input.leaderId || null,
    schedule: input.schedule,
    duration: input.duration,
    startDate: input.startDate,
    location: input.location,
    status: input.status || 'draft',
    capacity: input.capacity,
    recruitmentAssessments: input.recruitmentAssessments || [],
    overallAssessments: input.overallAssessments || [],
    screeningNotes: input.screeningNotes,
    createdBy: input.createdBy,
  }).returning();

  // Auto-generate session records from scheme if linked
  if (input.schemeId) {
    const schemeSessions = await db
      .select()
      .from(groupSchemeSessions)
      .where(eq(groupSchemeSessions.schemeId, input.schemeId))
      .orderBy(asc(groupSchemeSessions.sortOrder));

    if (schemeSessions.length > 0) {
      await db.insert(groupSessionRecords).values(
        schemeSessions.map((ss, idx) => ({
          instanceId: instance.id,
          schemeSessionId: ss.id,
          sessionNumber: idx + 1,
          title: ss.title,
          status: 'planned',
        })),
      );
    }
  }

  return instance;
}

export async function updateInstance(
  instanceId: string,
  updates: Partial<{
    title: string;
    description: string;
    category: string;
    leaderId: string;
    schedule: string;
    duration: string;
    startDate: string;
    location: string;
    status: string;
    capacity: number;
    recruitmentAssessments: string[];
    overallAssessments: string[];
    screeningNotes: string;
  }>,
) {
  const [updated] = await db
    .update(groupInstances)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(groupInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('GroupInstance', instanceId);
  return updated;
}

export async function deleteInstance(instanceId: string) {
  const [deleted] = await db
    .delete(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .returning();

  if (!deleted) throw new NotFoundError('GroupInstance', instanceId);
  return deleted;
}
