import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseInstances, courseEnrollments, courses, users } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listInstances(
  orgId: string,
  filters?: { status?: string; courseId?: string; search?: string },
) {
  const conditions = [eq(courseInstances.orgId, orgId)];
  if (filters?.status) conditions.push(eq(courseInstances.status, filters.status));
  if (filters?.courseId) conditions.push(eq(courseInstances.courseId, filters.courseId));

  const enrollmentCountSq = db
    .select({
      instanceId: courseEnrollments.instanceId,
      enrollmentCount: count(courseEnrollments.id).as('enrollment_count'),
    })
    .from(courseEnrollments)
    .groupBy(courseEnrollments.instanceId)
    .as('ec');

  const rows = await db
    .select({
      instance: courseInstances,
      enrollmentCount: sql<number>`coalesce(${enrollmentCountSq.enrollmentCount}, 0)`.mapWith(Number),
    })
    .from(courseInstances)
    .leftJoin(enrollmentCountSq, eq(enrollmentCountSq.instanceId, courseInstances.id))
    .where(and(...conditions))
    .orderBy(desc(courseInstances.createdAt));

  let results = rows.map((r) => ({
    ...r.instance,
    enrollmentCount: r.enrollmentCount,
  }));

  if (filters?.search) {
    const s = filters.search.toLowerCase();
    results = results.filter(
      (r) =>
        r.title.toLowerCase().includes(s) ||
        (r.description || '').toLowerCase().includes(s),
    );
  }

  return results;
}

export async function getInstanceById(instanceId: string) {
  const [instance] = await db
    .select({
      instance: courseInstances,
      courseTitle: courses.title,
      courseCategory: courses.category,
    })
    .from(courseInstances)
    .leftJoin(courses, eq(courses.id, courseInstances.courseId))
    .where(eq(courseInstances.id, instanceId))
    .limit(1);

  if (!instance) throw new NotFoundError('CourseInstance', instanceId);

  const enrollments = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.instanceId, instanceId));

  const totalEnrolled = enrollments.length;
  const completedCount = enrollments.filter((e) => e.status === 'completed').length;

  return {
    ...instance.instance,
    course: {
      title: instance.courseTitle,
      category: instance.courseCategory,
    },
    enrollmentStats: {
      total: totalEnrolled,
      completed: completedCount,
    },
  };
}

export async function createInstance(input: {
  orgId: string;
  courseId: string;
  title: string;
  description?: string;
  publishMode: string;
  capacity?: number;
  targetGroupLabel?: string;
  responsibleId?: string;
  createdBy: string;
}) {
  const [instance] = await db
    .insert(courseInstances)
    .values({
      orgId: input.orgId,
      courseId: input.courseId,
      title: input.title,
      description: input.description,
      publishMode: input.publishMode || 'assign',
      capacity: input.capacity,
      targetGroupLabel: input.targetGroupLabel,
      responsibleId: input.responsibleId || null,
      createdBy: input.createdBy,
      status: 'draft',
    })
    .returning();

  return instance;
}

export async function updateInstance(
  instanceId: string,
  updates: Partial<{
    title: string;
    description: string;
    publishMode: string;
    capacity: number;
    targetGroupLabel: string;
    responsibleId: string;
  }>,
) {
  const [updated] = await db
    .update(courseInstances)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(courseInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('CourseInstance', instanceId);
  return updated;
}

export async function deleteInstance(instanceId: string) {
  // Only allow deleting draft instances
  const [instance] = await db
    .select()
    .from(courseInstances)
    .where(eq(courseInstances.id, instanceId))
    .limit(1);

  if (!instance) throw new NotFoundError('CourseInstance', instanceId);
  if (instance.status !== 'draft') {
    throw new Error('Only draft instances can be deleted');
  }

  const [deleted] = await db
    .delete(courseInstances)
    .where(eq(courseInstances.id, instanceId))
    .returning();

  return deleted;
}

export async function activateInstance(instanceId: string) {
  const [updated] = await db
    .update(courseInstances)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(courseInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('CourseInstance', instanceId);
  return updated;
}

export async function closeInstance(instanceId: string) {
  const [updated] = await db
    .update(courseInstances)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(courseInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('CourseInstance', instanceId);
  return updated;
}

export async function archiveInstance(instanceId: string) {
  const [updated] = await db
    .update(courseInstances)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(courseInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('CourseInstance', instanceId);
  return updated;
}
