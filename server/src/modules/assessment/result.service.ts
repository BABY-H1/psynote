import { eq, and, isNull, desc, or, asc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  assessmentResults, assessments, assessmentScales,
  scales, scaleDimensions, dimensionRules, scaleItems,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { generateIndividualSingleReport } from './report.service.js';

/** List results for an org, optionally filtered */
export async function listResults(
  orgId: string,
  filters?: {
    assessmentId?: string;
    userId?: string;
    careEpisodeId?: string;
    batchId?: string;
    riskLevel?: string;
  },
) {
  const conditions = [
    eq(assessmentResults.orgId, orgId),
    isNull(assessmentResults.deletedAt),
  ];

  if (filters?.assessmentId) {
    conditions.push(eq(assessmentResults.assessmentId, filters.assessmentId));
  }
  if (filters?.userId) {
    conditions.push(eq(assessmentResults.userId, filters.userId));
  }
  if (filters?.careEpisodeId) {
    conditions.push(eq(assessmentResults.careEpisodeId, filters.careEpisodeId));
  }
  if (filters?.batchId) {
    conditions.push(eq(assessmentResults.batchId, filters.batchId));
  }
  if (filters?.riskLevel) {
    conditions.push(eq(assessmentResults.riskLevel, filters.riskLevel));
  }

  return db
    .select()
    .from(assessmentResults)
    .where(and(...conditions))
    .orderBy(desc(assessmentResults.createdAt));
}

/** Get a single result by ID */
export async function getResultById(resultId: string) {
  const [result] = await db
    .select()
    .from(assessmentResults)
    .where(eq(assessmentResults.id, resultId))
    .limit(1);

  if (!result) throw new NotFoundError('AssessmentResult', resultId);
  return result;
}

/**
 * Score and save an assessment submission.
 * Calculates dimension scores based on answers + scale structure.
 */
export async function submitResult(input: {
  orgId: string;
  assessmentId: string;
  userId?: string;
  careEpisodeId?: string;
  batchId?: string;
  demographicData?: Record<string, unknown>;
  answers: Record<string, number>; // { itemId: selectedValue }
  createdBy?: string;
}) {
  // Load the assessment and its scales
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, input.assessmentId))
    .limit(1);

  if (!assessment) throw new NotFoundError('Assessment', input.assessmentId);

  // Resolve orgId from assessment if not provided (public submissions)
  const orgId = input.orgId || assessment.orgId;

  // Get linked scale IDs
  const linkedScales = await db
    .select({ scaleId: assessmentScales.scaleId })
    .from(assessmentScales)
    .where(eq(assessmentScales.assessmentId, input.assessmentId))
    .orderBy(asc(assessmentScales.sortOrder));

  const scaleIds = linkedScales.map((s) => s.scaleId);

  // Load all dimensions for these scales
  const allDimensions = scaleIds.length > 0
    ? await db
        .select()
        .from(scaleDimensions)
        .where(or(...scaleIds.map((id) => eq(scaleDimensions.scaleId, id))))
    : [];

  // Load all items for these scales
  const allItems = scaleIds.length > 0
    ? await db
        .select()
        .from(scaleItems)
        .where(or(...scaleIds.map((id) => eq(scaleItems.scaleId, id))))
    : [];

  // Load all rules for dimensions
  const dimIds = allDimensions.map((d) => d.id);
  const allRules = dimIds.length > 0
    ? await db
        .select()
        .from(dimensionRules)
        .where(or(...dimIds.map((id) => eq(dimensionRules.dimensionId, id))))
    : [];

  // Load scale scoring modes
  const scaleRows = scaleIds.length > 0
    ? await db
        .select({ id: scales.id, scoringMode: scales.scoringMode })
        .from(scales)
        .where(or(...scaleIds.map((id) => eq(scales.id, id))))
    : [];
  const scoringModeMap = new Map(scaleRows.map((s) => [s.id, s.scoringMode]));

  // Build item map: itemId → item
  const itemMap = new Map(allItems.map((it) => [it.id, it]));

  // Calculate dimension scores
  const dimensionScores: Record<string, number> = {};
  let highestRiskLevel: string | null = null;
  const riskPriority: Record<string, number> = {
    level_1: 1, level_2: 2, level_3: 3, level_4: 4,
  };

  for (const dim of allDimensions) {
    // Find items belonging to this dimension
    const dimItems = allItems.filter((it) => it.dimensionId === dim.id);
    let score = 0;
    let answeredCount = 0;

    for (const item of dimItems) {
      const answer = input.answers[item.id];
      if (answer !== undefined) {
        // Handle reverse scoring
        if (item.isReverseScored) {
          const options = item.options as { label: string; value: number }[];
          const maxVal = Math.max(...options.map((o) => o.value));
          const minVal = Math.min(...options.map((o) => o.value));
          score += maxVal + minVal - answer;
        } else {
          score += answer;
        }
        answeredCount++;
      }
    }

    // Apply calculation method
    if (dim.calculationMethod === 'average' && answeredCount > 0) {
      score = score / answeredCount;
    }

    dimensionScores[dim.id] = Math.round(score * 100) / 100;

    // Find matching risk level from dimension rules
    const rules = allRules.filter((r) => r.dimensionId === dim.id);
    for (const rule of rules) {
      const min = parseFloat(rule.minScore);
      const max = parseFloat(rule.maxScore);
      if (score >= min && score <= max && rule.riskLevel) {
        const currentPriority = highestRiskLevel ? (riskPriority[highestRiskLevel] || 0) : 0;
        const rulePriority = riskPriority[rule.riskLevel] || 0;
        if (rulePriority > currentPriority) {
          highestRiskLevel = rule.riskLevel;
        }
      }
    }
  }

  // Calculate total score (sum of all dimension scores)
  const totalScore = Object.values(dimensionScores).reduce((sum, s) => sum + s, 0);

  // Insert result
  const [result] = await db.insert(assessmentResults).values({
    orgId,
    assessmentId: input.assessmentId,
    userId: input.userId || null,
    careEpisodeId: input.careEpisodeId || null,
    batchId: input.batchId || null,
    demographicData: input.demographicData || {},
    answers: input.answers,
    dimensionScores,
    totalScore: String(totalScore),
    riskLevel: highestRiskLevel,
    createdBy: input.createdBy || null,
  }).returning();

  // Fire-and-forget: generate report without blocking the submission response
  void generateIndividualSingleReport({
    orgId,
    resultId: result.id,
    generatedBy: input.createdBy || 'system',
  }).catch(() => { /* report generation failure is non-blocking */ });

  return result;
}

/** Soft delete a result */
export async function softDeleteResult(resultId: string) {
  const [updated] = await db
    .update(assessmentResults)
    .set({ deletedAt: new Date() })
    .where(and(eq(assessmentResults.id, resultId), isNull(assessmentResults.deletedAt)))
    .returning();

  if (!updated) throw new NotFoundError('AssessmentResult', resultId);
  return updated;
}
