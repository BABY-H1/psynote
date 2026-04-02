import { eq, and, isNull, asc, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { assessments, assessmentScales, scales } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listAssessments(orgId: string, includeDeleted = false) {
  const conditions = [eq(assessments.orgId, orgId)];
  if (!includeDeleted) {
    conditions.push(isNull(assessments.deletedAt));
  }

  return db
    .select()
    .from(assessments)
    .where(and(...conditions))
    .orderBy(desc(assessments.createdAt));
}

export async function getAssessmentById(assessmentId: string) {
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) throw new NotFoundError('Assessment', assessmentId);

  // Get associated scales
  const assocScales = await db
    .select({
      scaleId: assessmentScales.scaleId,
      sortOrder: assessmentScales.sortOrder,
      scale: scales,
    })
    .from(assessmentScales)
    .innerJoin(scales, eq(scales.id, assessmentScales.scaleId))
    .where(eq(assessmentScales.assessmentId, assessmentId))
    .orderBy(asc(assessmentScales.sortOrder));

  return {
    ...assessment,
    scales: assocScales.map((s) => ({
      id: s.scale.id,
      title: s.scale.title,
      description: s.scale.description,
      sortOrder: s.sortOrder,
    })),
  };
}

export async function createAssessment(input: {
  orgId: string;
  title: string;
  description?: string;
  demographics?: unknown[];
  scaleIds: string[];
  createdBy: string;
}) {
  const [assessment] = await db.insert(assessments).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    demographics: input.demographics || [],
    createdBy: input.createdBy,
  }).returning();

  // Link scales
  if (input.scaleIds.length > 0) {
    await db.insert(assessmentScales).values(
      input.scaleIds.map((scaleId, idx) => ({
        assessmentId: assessment.id,
        scaleId,
        sortOrder: idx,
      })),
    );
  }

  return getAssessmentById(assessment.id);
}

export async function updateAssessment(
  assessmentId: string,
  updates: Partial<{
    title: string;
    description: string;
    demographics: unknown[];
    isActive: boolean;
    scaleIds: string[];
  }>,
) {
  const { scaleIds, ...fields } = updates;

  if (Object.keys(fields).length > 0) {
    const [updated] = await db
      .update(assessments)
      .set(fields)
      .where(eq(assessments.id, assessmentId))
      .returning();

    if (!updated) throw new NotFoundError('Assessment', assessmentId);
  }

  // Replace scale associations if provided
  if (scaleIds) {
    await db
      .delete(assessmentScales)
      .where(eq(assessmentScales.assessmentId, assessmentId));

    if (scaleIds.length > 0) {
      await db.insert(assessmentScales).values(
        scaleIds.map((scaleId, idx) => ({
          assessmentId,
          scaleId,
          sortOrder: idx,
        })),
      );
    }
  }

  return getAssessmentById(assessmentId);
}

/** Soft delete */
export async function softDeleteAssessment(assessmentId: string) {
  const [updated] = await db
    .update(assessments)
    .set({ deletedAt: new Date() })
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
    .returning();

  if (!updated) throw new NotFoundError('Assessment', assessmentId);
  return updated;
}

/** Restore from soft delete */
export async function restoreAssessment(assessmentId: string) {
  const [updated] = await db
    .update(assessments)
    .set({ deletedAt: null })
    .where(eq(assessments.id, assessmentId))
    .returning();

  if (!updated) throw new NotFoundError('Assessment', assessmentId);
  return updated;
}

/** Hard delete */
export async function deleteAssessment(assessmentId: string) {
  const [deleted] = await db
    .delete(assessments)
    .where(eq(assessments.id, assessmentId))
    .returning();

  if (!deleted) throw new NotFoundError('Assessment', assessmentId);
  return deleted;
}
