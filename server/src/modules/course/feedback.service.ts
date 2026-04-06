import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseFeedbackForms, courseFeedbackResponses, courseEnrollments, users } from '../../db/schema.js';

export async function listFeedbackForms(instanceId: string, chapterId?: string) {
  const conditions = [eq(courseFeedbackForms.instanceId, instanceId)];
  if (chapterId) {
    conditions.push(eq(courseFeedbackForms.chapterId, chapterId));
  }

  return db
    .select()
    .from(courseFeedbackForms)
    .where(and(...conditions))
    .orderBy(desc(courseFeedbackForms.createdAt));
}

export async function createFeedbackForm(input: {
  instanceId: string;
  chapterId?: string;
  title?: string;
  questions: unknown;
}) {
  const [form] = await db.insert(courseFeedbackForms).values({
    instanceId: input.instanceId,
    chapterId: input.chapterId || null,
    title: input.title || null,
    questions: input.questions,
  }).returning();

  return form;
}

export async function updateFeedbackForm(
  formId: string,
  updates: Partial<{ title: string; questions: unknown; isActive: boolean }>,
) {
  const [updated] = await db
    .update(courseFeedbackForms)
    .set(updates)
    .where(eq(courseFeedbackForms.id, formId))
    .returning();

  return updated;
}

export async function deleteFeedbackForm(formId: string) {
  const [deleted] = await db
    .delete(courseFeedbackForms)
    .where(eq(courseFeedbackForms.id, formId))
    .returning();

  return deleted;
}

export async function submitFeedbackResponse(
  formId: string,
  enrollmentId: string,
  answers: unknown,
) {
  // Upsert: if a response already exists for this form+enrollment, update it
  const [existing] = await db
    .select()
    .from(courseFeedbackResponses)
    .where(and(
      eq(courseFeedbackResponses.formId, formId),
      eq(courseFeedbackResponses.enrollmentId, enrollmentId),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(courseFeedbackResponses)
      .set({ answers, submittedAt: new Date() })
      .where(eq(courseFeedbackResponses.id, existing.id))
      .returning();
    return updated;
  }

  const [response] = await db.insert(courseFeedbackResponses).values({
    formId,
    enrollmentId,
    answers,
  }).returning();

  return response;
}

export async function listFeedbackResponses(formId: string) {
  return db
    .select({
      response: courseFeedbackResponses,
      userName: users.name,
      userEmail: users.email,
    })
    .from(courseFeedbackResponses)
    .innerJoin(courseEnrollments, eq(courseEnrollments.id, courseFeedbackResponses.enrollmentId))
    .innerJoin(users, eq(users.id, courseEnrollments.userId))
    .where(eq(courseFeedbackResponses.formId, formId))
    .orderBy(desc(courseFeedbackResponses.submittedAt));
}

export async function getFeedbackStats(instanceId: string) {
  return db
    .select({
      formId: courseFeedbackResponses.formId,
      formTitle: courseFeedbackForms.title,
      responseCount: count(courseFeedbackResponses.id),
    })
    .from(courseFeedbackForms)
    .leftJoin(courseFeedbackResponses, eq(courseFeedbackResponses.formId, courseFeedbackForms.id))
    .where(eq(courseFeedbackForms.instanceId, instanceId))
    .groupBy(courseFeedbackResponses.formId, courseFeedbackForms.id, courseFeedbackForms.title);
}
