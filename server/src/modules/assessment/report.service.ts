import { eq, and, desc, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  assessmentReports, assessmentResults, scaleDimensions, dimensionRules,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listReports(orgId: string) {
  return db
    .select()
    .from(assessmentReports)
    .where(eq(assessmentReports.orgId, orgId))
    .orderBy(desc(assessmentReports.createdAt));
}

export async function getReportById(reportId: string) {
  const [report] = await db
    .select()
    .from(assessmentReports)
    .where(eq(assessmentReports.id, reportId))
    .limit(1);

  if (!report) throw new NotFoundError('AssessmentReport', reportId);
  return report;
}

/** Generate an individual single-assessment report */
export async function generateIndividualSingleReport(input: {
  orgId: string;
  resultId: string;
  generatedBy: string;
}) {
  const [result] = await db
    .select()
    .from(assessmentResults)
    .where(eq(assessmentResults.id, input.resultId))
    .limit(1);

  if (!result) throw new NotFoundError('AssessmentResult', input.resultId);

  const dimScores = result.dimensionScores as Record<string, number>;
  const dimIds = Object.keys(dimScores);

  // Load dimension names and rules
  const dims = dimIds.length > 0
    ? await db.select().from(scaleDimensions)
        .where(or(...dimIds.map((id) => eq(scaleDimensions.id, id))))
    : [];

  const allRules = dimIds.length > 0
    ? await db.select().from(dimensionRules)
        .where(or(...dimIds.map((id) => eq(dimensionRules.dimensionId, id))))
    : [];

  const interpretations = dims.map((dim) => {
    const score = dimScores[dim.id] || 0;
    const rules = allRules.filter((r) => r.dimensionId === dim.id);
    const matchedRule = rules.find((r) =>
      score >= parseFloat(r.minScore) && score <= parseFloat(r.maxScore),
    );

    return {
      dimension: dim.name,
      dimensionId: dim.id,
      score,
      label: matchedRule?.label || '',
      riskLevel: matchedRule?.riskLevel || null,
      advice: matchedRule?.advice || null,
    };
  });

  const content = {
    userId: result.userId,
    demographics: result.demographicData,
    dimensionScores: dimScores,
    totalScore: result.totalScore,
    riskLevel: result.riskLevel,
    interpretationPerDimension: interpretations,
  };

  const [report] = await db.insert(assessmentReports).values({
    orgId: input.orgId,
    title: `个人测评报告`,
    reportType: 'individual_single',
    resultIds: [input.resultId],
    assessmentId: result.assessmentId,
    content,
    generatedBy: input.generatedBy,
  }).returning();

  return report;
}

/** Generate a group single-assessment report from multiple results */
export async function generateGroupSingleReport(input: {
  orgId: string;
  resultIds: string[];
  title: string;
  generatedBy: string;
}) {
  const results = await db
    .select()
    .from(assessmentResults)
    .where(or(...input.resultIds.map((id) => eq(assessmentResults.id, id))));

  if (results.length === 0) throw new NotFoundError('AssessmentResults', 'batch');

  // Aggregate risk distribution
  const riskDistribution: Record<string, number> = {};
  for (const r of results) {
    const level = r.riskLevel || 'unknown';
    riskDistribution[level] = (riskDistribution[level] || 0) + 1;
  }

  // Aggregate dimension stats
  const allDimScores: Record<string, number[]> = {};
  for (const r of results) {
    const scores = r.dimensionScores as Record<string, number>;
    for (const [dimId, score] of Object.entries(scores)) {
      if (!allDimScores[dimId]) allDimScores[dimId] = [];
      allDimScores[dimId].push(score);
    }
  }

  const dimensionStats: Record<string, {
    mean: number; median: number; stdDev: number; min: number; max: number;
  }> = {};

  for (const [dimId, scores] of Object.entries(allDimScores)) {
    const sorted = [...scores].sort((a, b) => a - b);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;

    dimensionStats[dimId] = {
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  const content = {
    participantCount: results.length,
    riskDistribution,
    dimensionStats,
  };

  const assessmentId = results[0].assessmentId;

  const [report] = await db.insert(assessmentReports).values({
    orgId: input.orgId,
    title: input.title,
    reportType: 'group_single',
    resultIds: input.resultIds,
    assessmentId,
    content,
    generatedBy: input.generatedBy,
  }).returning();

  return report;
}
