import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseHomeworkDefs, courseHomeworkSubmissions, courseEnrollments, users } from '../../db/schema.js';

export async function listHomeworkDefs(instanceId: string, chapterId?: string) {
  const conditions = [eq(courseHomeworkDefs.instanceId, instanceId)];
  if (chapterId) {
    conditions.push(eq(courseHomeworkDefs.chapterId, chapterId));
  }

  return db
    .select()
    .from(courseHomeworkDefs)
    .where(and(...conditions))
    .orderBy(courseHomeworkDefs.sortOrder);
}

export async function createHomeworkDef(input: {
  instanceId: string;
  chapterId?: string;
  title?: string;
  description?: string;
  questionType: string;
  options?: unknown;
  isRequired?: boolean;
  sortOrder?: number;
}) {
  const [def] = await db.insert(courseHomeworkDefs).values({
    instanceId: input.instanceId,
    chapterId: input.chapterId || null,
    title: input.title || null,
    description: input.description || null,
    questionType: input.questionType,
    options: input.options || null,
    isRequired: input.isRequired ?? true,
    sortOrder: input.sortOrder ?? 0,
  }).returning();

  return def;
}

export async function updateHomeworkDef(
  defId: string,
  updates: Partial<{
    title: string;
    description: string;
    questionType: string;
    options: unknown;
    isRequired: boolean;
    sortOrder: number;
  }>,
) {
  const [updated] = await db
    .update(courseHomeworkDefs)
    .set(updates)
    .where(eq(courseHomeworkDefs.id, defId))
    .returning();

  return updated;
}

export async function deleteHomeworkDef(defId: string) {
  const [deleted] = await db
    .delete(courseHomeworkDefs)
    .where(eq(courseHomeworkDefs.id, defId))
    .returning();

  return deleted;
}

export async function submitHomework(
  defId: string,
  enrollmentId: string,
  content?: string,
  selectedOptions?: unknown,
) {
  // Upsert: if a submission already exists for this def+enrollment, update it
  const [existing] = await db
    .select()
    .from(courseHomeworkSubmissions)
    .where(and(
      eq(courseHomeworkSubmissions.homeworkDefId, defId),
      eq(courseHomeworkSubmissions.enrollmentId, enrollmentId),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(courseHomeworkSubmissions)
      .set({
        content: content || null,
        selectedOptions: selectedOptions || null,
        status: 'submitted',
        updatedAt: new Date(),
      })
      .where(eq(courseHomeworkSubmissions.id, existing.id))
      .returning();
    return updated;
  }

  const [submission] = await db.insert(courseHomeworkSubmissions).values({
    homeworkDefId: defId,
    enrollmentId,
    content: content || null,
    selectedOptions: selectedOptions || null,
  }).returning();

  return submission;
}

export async function listSubmissions(defId: string) {
  return db
    .select({
      submission: courseHomeworkSubmissions,
      userName: users.name,
      userEmail: users.email,
    })
    .from(courseHomeworkSubmissions)
    .innerJoin(courseEnrollments, eq(courseEnrollments.id, courseHomeworkSubmissions.enrollmentId))
    .innerJoin(users, eq(users.id, courseEnrollments.userId))
    .where(eq(courseHomeworkSubmissions.homeworkDefId, defId))
    .orderBy(desc(courseHomeworkSubmissions.submittedAt));
}

export async function reviewSubmission(
  subId: string,
  reviewComment: string,
  reviewedBy: string,
) {
  const [updated] = await db
    .update(courseHomeworkSubmissions)
    .set({
      status: 'reviewed',
      reviewComment,
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(courseHomeworkSubmissions.id, subId))
    .returning();

  return updated;
}
