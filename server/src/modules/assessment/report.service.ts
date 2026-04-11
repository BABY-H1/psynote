import { eq, and, desc, or, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  assessmentReports, assessmentResults, scaleDimensions, dimensionRules,
  groupInstances, groupEnrollments, courseInstances, courseEnrollments,
  users,
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

export async function updateReportNarrative(reportId: string, narrative: string) {
  const [updated] = await db
    .update(assessmentReports)
    .set({ aiNarrative: narrative })
    .where(eq(assessmentReports.id, reportId))
    .returning();

  if (!updated) throw new NotFoundError('AssessmentReport', reportId);
  return updated;
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

  // Load dimension names
  const dimIds = Object.keys(allDimScores);
  const dimNameMap: Record<string, string> = {};
  if (dimIds.length > 0) {
    const dims = await db.select({ id: scaleDimensions.id, name: scaleDimensions.name })
      .from(scaleDimensions)
      .where(or(...dimIds.map((id) => eq(scaleDimensions.id, id))));
    for (const d of dims) dimNameMap[d.id] = d.name;
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

    const dimName = dimNameMap[dimId] || dimId;
    dimensionStats[dimName] = {
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

/** Generate a trend report for a user across multiple assessment results */
export async function generateTrendReport(input: {
  orgId: string;
  assessmentId: string;
  userId: string;
  generatedBy: string;
}) {
  const userResults = await db
    .select()
    .from(assessmentResults)
    .where(
      and(
        eq(assessmentResults.assessmentId, input.assessmentId),
        eq(assessmentResults.userId, input.userId),
      ),
    )
    .orderBy(desc(assessmentResults.createdAt));

  if (userResults.length < 2) {
    throw new Error('At least 2 results are required for a trend report');
  }

  // Load dimension names
  const allDimIds = new Set<string>();
  for (const r of userResults) {
    const scores = r.dimensionScores as Record<string, number>;
    Object.keys(scores).forEach((id) => allDimIds.add(id));
  }

  const dims = allDimIds.size > 0
    ? await db.select().from(scaleDimensions)
        .where(or(...[...allDimIds].map((id) => eq(scaleDimensions.id, id))))
    : [];

  const dimNameMap: Record<string, string> = {};
  for (const d of dims) dimNameMap[d.id] = d.name;

  const timeline = userResults.map((r, idx) => {
    const scores = r.dimensionScores as Record<string, number>;
    return {
      index: userResults.length - idx,
      date: r.createdAt,
      totalScore: r.totalScore,
      riskLevel: r.riskLevel,
      dimensionScores: Object.fromEntries(
        Object.entries(scores).map(([id, score]) => [dimNameMap[id] || id, score]),
      ),
    };
  }).reverse();

  const trends: Record<string, 'improving' | 'worsening' | 'stable'> = {};
  if (timeline.length >= 2) {
    const first = timeline[0].dimensionScores;
    const last = timeline[timeline.length - 1].dimensionScores;
    for (const key of Object.keys(last)) {
      const diff = (last[key] || 0) - (first[key] || 0);
      if (Math.abs(diff) < 1) trends[key] = 'stable';
      else if (diff < 0) trends[key] = 'improving';
      else trends[key] = 'worsening';
    }
  }

  const content = {
    userId: input.userId,
    assessmentCount: userResults.length,
    timeline,
    trends,
  };

  const [report] = await db.insert(assessmentReports).values({
    orgId: input.orgId,
    title: `追踪评估趋势报告`,
    reportType: 'individual_trend',
    resultIds: userResults.map((r) => r.id),
    assessmentId: input.assessmentId,
    content,
    generatedBy: input.generatedBy,
  }).returning();

  return report;
}

/**
 * Generate a group-level longitudinal report for a group/course instance.
 * Compares pre vs post assessment results across all members, computing
 * group mean trajectories and effect sizes (Cohen's d).
 */
export async function generateGroupLongitudinalReport(input: {
  orgId: string;
  instanceId: string;
  instanceType: 'group' | 'course';
  generatedBy: string;
}) {
  // 1. Get instance + assessmentConfig
  let instance: any;
  let memberUserIds: string[] = [];

  if (input.instanceType === 'group') {
    [instance] = await db.select().from(groupInstances).where(eq(groupInstances.id, input.instanceId)).limit(1);
    if (!instance) throw new NotFoundError('GroupInstance', input.instanceId);
    const enrollments = await db.select({ userId: groupEnrollments.userId })
      .from(groupEnrollments)
      .where(and(eq(groupEnrollments.instanceId, input.instanceId), eq(groupEnrollments.status, 'approved')));
    memberUserIds = enrollments.map((e) => e.userId);
  } else {
    [instance] = await db.select().from(courseInstances).where(eq(courseInstances.id, input.instanceId)).limit(1);
    if (!instance) throw new NotFoundError('CourseInstance', input.instanceId);
    const enrollments = await db.select({ userId: courseEnrollments.userId })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.instanceId, input.instanceId));
    memberUserIds = enrollments.map((e) => e.userId);
  }

  if (memberUserIds.length === 0) {
    throw new Error('No enrolled members found');
  }

  const config = (instance.assessmentConfig || {}) as Record<string, unknown>;
  const preGroupIds = (config.preGroup || []) as string[];
  const postGroupIds = (config.postGroup || []) as string[];

  // Collect all assessment IDs to query
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const allAssessmentIds = [...new Set([...preGroupIds, ...postGroupIds])].filter((id) => uuidRegex.test(id));

  if (allAssessmentIds.length === 0) {
    throw new Error('No valid assessment IDs in assessmentConfig');
  }

  // 2. Fetch all results for these members + assessments
  const allResults = await db
    .select()
    .from(assessmentResults)
    .where(and(
      inArray(assessmentResults.userId, memberUserIds),
      inArray(assessmentResults.assessmentId, allAssessmentIds),
    ))
    .orderBy(assessmentResults.createdAt);

  // 3. Group results by assessmentId → userId → time-ordered list
  const resultMap = new Map<string, Map<string, any[]>>();
  for (const r of allResults) {
    if (!resultMap.has(r.assessmentId)) resultMap.set(r.assessmentId, new Map());
    const userMap = resultMap.get(r.assessmentId)!;
    if (!userMap.has(r.userId!)) userMap.set(r.userId!, []);
    userMap.get(r.userId!)!.push(r);
  }

  // 4. Compute per-assessment statistics
  const assessmentComparisons: Array<{
    assessmentId: string;
    participantCount: number;
    prePostPairs: number;
    preMean: number;
    postMean: number;
    meanChange: number;
    cohensD: number | null;
    memberDetails: Array<{ userId: string; preScore: number | null; postScore: number | null; change: number | null }>;
  }> = [];

  for (const assessmentId of allAssessmentIds) {
    const userMap = resultMap.get(assessmentId);
    if (!userMap) continue;

    const memberDetails: Array<{ userId: string; preScore: number | null; postScore: number | null; change: number | null }> = [];
    const preScores: number[] = [];
    const postScores: number[] = [];
    const changes: number[] = [];

    for (const userId of memberUserIds) {
      const results = userMap.get(userId) || [];
      const preScore = results.length > 0 ? results[0].totalScore : null;
      const postScore = results.length > 1 ? results[results.length - 1].totalScore : null;
      const change = preScore != null && postScore != null ? postScore - preScore : null;

      memberDetails.push({ userId, preScore, postScore, change });
      if (preScore != null) preScores.push(preScore);
      if (postScore != null) postScores.push(postScore);
      if (change != null) changes.push(change);
    }

    const preMean = preScores.length > 0 ? preScores.reduce((a, b) => a + b, 0) / preScores.length : 0;
    const postMean = postScores.length > 0 ? postScores.reduce((a, b) => a + b, 0) / postScores.length : 0;
    const meanChange = postMean - preMean;

    // Cohen's d = (postMean - preMean) / pooled SD
    let cohensD: number | null = null;
    if (preScores.length >= 2 && postScores.length >= 2) {
      const preVar = preScores.reduce((s, v) => s + (v - preMean) ** 2, 0) / (preScores.length - 1);
      const postVar = postScores.reduce((s, v) => s + (v - postMean) ** 2, 0) / (postScores.length - 1);
      const pooledSD = Math.sqrt((preVar + postVar) / 2);
      if (pooledSD > 0) cohensD = Math.round((meanChange / pooledSD) * 100) / 100;
    }

    assessmentComparisons.push({
      assessmentId,
      participantCount: memberUserIds.length,
      prePostPairs: changes.length,
      preMean: Math.round(preMean * 100) / 100,
      postMean: Math.round(postMean * 100) / 100,
      meanChange: Math.round(meanChange * 100) / 100,
      cohensD,
      memberDetails,
    });
  }

  // 5. Get member names
  const memberRows = memberUserIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, memberUserIds))
    : [];
  const nameMap = new Map(memberRows.map((u) => [u.id, u.name]));

  const content = {
    instanceTitle: instance.title,
    memberCount: memberUserIds.length,
    memberNames: Object.fromEntries(nameMap),
    assessmentComparisons,
    generatedAt: new Date().toISOString(),
  };

  // 6. Save report
  const [report] = await db.insert(assessmentReports).values({
    orgId: input.orgId,
    title: `${instance.title} — 纵向对比报告`,
    reportType: 'group_longitudinal',
    resultIds: allResults.map((r) => r.id),
    assessmentId: allAssessmentIds[0] || null,
    content,
    generatedBy: input.generatedBy,
  }).returning();

  return report;
}
