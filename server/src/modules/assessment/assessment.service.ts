import { eq, and, isNull, asc, desc, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { assessments, assessmentScales, scales, scaleDimensions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import crypto from 'crypto';

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

  // Get associated scales (for backward compatibility and runner)
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

  // Load dimensions for all associated scales
  const scaleIds = assocScales.map((s) => s.scale.id);
  const dimensions = scaleIds.length > 0
    ? await db.select({ id: scaleDimensions.id, name: scaleDimensions.name, scaleId: scaleDimensions.scaleId })
        .from(scaleDimensions)
        .where(or(...scaleIds.map((sid) => eq(scaleDimensions.scaleId, sid))))
    : [];

  // Build dimension name map: { dimensionId -> dimensionName }
  const dimensionNameMap: Record<string, string> = {};
  for (const d of dimensions) dimensionNameMap[d.id] = d.name;

  return {
    ...assessment,
    scales: assocScales.map((s) => ({
      id: s.scale.id,
      title: s.scale.title,
      description: s.scale.description,
      sortOrder: s.sortOrder,
    })),
    dimensionNameMap,
  };
}

export async function createAssessment(input: {
  orgId: string;
  title: string;
  description?: string;
  assessmentType?: string;
  demographics?: unknown[];
  blocks?: unknown[];
  screeningRules?: unknown;
  collectMode?: string;
  resultDisplay?: unknown;
  status?: string;
  scaleIds?: string[];
  createdBy: string;
}) {
  // Generate a unique share token
  const shareToken = crypto.randomBytes(8).toString('hex');

  // Extract scale IDs from blocks if blocks are provided
  const blocks = (input.blocks || []) as { type: string; scaleId?: string; sortOrder: number }[];
  const scaleIdsFromBlocks = blocks
    .filter((b) => b.type === 'scale' && b.scaleId)
    .map((b) => b.scaleId!);
  const scaleIds = input.scaleIds || scaleIdsFromBlocks;

  const [assessment] = await db.insert(assessments).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    assessmentType: input.assessmentType || 'screening',
    demographics: input.demographics || [],
    blocks: input.blocks || [],
    screeningRules: input.screeningRules || {},
    collectMode: input.collectMode || 'anonymous',
    status: input.status || 'active',
    resultDisplay: input.resultDisplay || {
      mode: 'custom',
      show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice', 'aiInterpret'],
    },
    shareToken,
    createdBy: input.createdBy,
  }).returning();

  // Link scales via junction table (for scoring engine compatibility)
  if (scaleIds.length > 0) {
    await db.insert(assessmentScales).values(
      scaleIds.map((scaleId, idx) => ({
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
    blocks: unknown[];
    collectMode: string;
    resultDisplay: unknown;
    isActive: boolean;
    scaleIds: string[];
  }>,
) {
  const { scaleIds, ...fields } = updates;

  // If blocks are updated, also update scaleIds from blocks
  let resolvedScaleIds = scaleIds;
  if (updates.blocks && !scaleIds) {
    const blocks = updates.blocks as { type: string; scaleId?: string }[];
    resolvedScaleIds = blocks
      .filter((b) => b.type === 'scale' && b.scaleId)
      .map((b) => b.scaleId!);
  }

  if (Object.keys(fields).length > 0) {
    const [updated] = await db
      .update(assessments)
      .set(fields)
      .where(eq(assessments.id, assessmentId))
      .returning();

    if (!updated) throw new NotFoundError('Assessment', assessmentId);
  }

  // Replace scale associations if provided
  if (resolvedScaleIds) {
    await db
      .delete(assessmentScales)
      .where(eq(assessmentScales.assessmentId, assessmentId));

    if (resolvedScaleIds.length > 0) {
      await db.insert(assessmentScales).values(
        resolvedScaleIds.map((scaleId, idx) => ({
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
