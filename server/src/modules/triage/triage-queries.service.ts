/**
 * Research-triage query service.
 *
 * Powers the "研判分流" workspace (GET /api/orgs/:orgId/triage/*). Unlike
 * crisis-dashboard which only counts L4 cases, this service surfaces
 * ALL four L levels from the underlying assessment_results — letting the
 * counselor decide next-step actions on L1/L2/L3 rows too.
 *
 * Data source (depends on `mode`):
 *   - mode='screening' (default)
 *       assessment_results JOIN assessments
 *       WHERE assessments.assessment_type = 'screening'
 *   - mode='manual'
 *       candidate_pool rows explicitly added outside the rule engine
 *       (sourceRuleId IS NULL). Today nothing writes to this path, but
 *       the "手工增加研判对象" UX scaffold is preserved here so future
 *       features can plug in without a second API shape.
 *   - mode='all' — union of the two, ordered by createdAt desc.
 *
 * Intake-type assessments are deliberately NOT in 'screening' mode:
 * their rule-triggered group/course candidates carry
 * `targetGroupInstanceId` / `targetCourseInstanceId` and are reverse-
 * looked-up by GroupInstanceDetail / CourseInstanceDetail via
 * listCandidatesForService below — a service-centric lens, not a person-
 * centric one.
 *
 * Row shape is a de-normalised view model (everything the left list
 * needs in a single request); the detail panel re-fetches the full
 * result via the existing /results/:id endpoint.
 */
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  assessmentResults,
  assessments,
  candidatePool,
  users,
} from '../../db/schema.js';
import type { DataScope } from '../../middleware/data-scope.js';

export type TriageMode = 'screening' | 'manual' | 'all';

export interface TriageCandidateRow {
  /** Where this row came from (drives the UX badge). */
  source: 'screening' | 'manual';
  /** assessment_results.id — null for pure manual candidates without a linked result */
  resultId: string | null;
  /** candidate_pool.id — populated iff the rule engine fired for this result */
  candidateId: string | null;
  userId: string | null;
  userName: string | null;
  assessmentId: string | null;
  assessmentTitle: string | null;
  assessmentType: string;
  riskLevel: string | null;
  totalScore: string | null;
  batchId: string | null;
  candidateStatus: string | null;
  candidateKind: string | null;
  suggestion: string | null;
  priority: string | null;
  latestEpisodeId: string | null;
  createdAt: Date;
}

export interface TriageListOpts {
  mode?: TriageMode;
  batchId?: string;
  assessmentId?: string;
  level?: string;
  counselorId?: string;
  scope?: DataScope;
}

export interface TriageBuckets {
  level_1: number;
  level_2: number;
  level_3: number;
  level_4: number;
  unrated: number;
}

// ─── listTriageCandidates ────────────────────────────────────────

export async function listTriageCandidates(
  orgId: string,
  opts: TriageListOpts,
): Promise<TriageCandidateRow[]> {
  const mode: TriageMode = opts.mode ?? 'screening';

  if (mode === 'screening') {
    return queryScreening(orgId, opts);
  }
  if (mode === 'manual') {
    return queryManual(orgId, opts);
  }
  // mode='all' — union, newest first
  const [s, m] = await Promise.all([
    queryScreening(orgId, opts),
    queryManual(orgId, opts),
  ]);
  return [...s, ...m].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

async function queryScreening(
  orgId: string,
  opts: TriageListOpts,
): Promise<TriageCandidateRow[]> {
  const conditions = [
    eq(assessmentResults.orgId, orgId),
    isNull(assessmentResults.deletedAt),
    eq(assessments.assessmentType, 'screening'),
  ];

  if (opts.batchId) conditions.push(eq(assessmentResults.batchId, opts.batchId));
  if (opts.assessmentId) conditions.push(eq(assessmentResults.assessmentId, opts.assessmentId));
  if (opts.level) conditions.push(eq(assessmentResults.riskLevel, opts.level));

  // Data-scope: when counselor has 'assigned' scope, restrict to allowedClientIds.
  // Empty allowedClientIds with assigned scope returns []; but we still allow
  // anonymous results (userId IS NULL, e.g. public screenings).
  if (opts.scope?.type === 'assigned') {
    if (!opts.scope.allowedClientIds || opts.scope.allowedClientIds.length === 0) {
      conditions.push(isNull(assessmentResults.userId));
    } else {
      conditions.push(
        sql`(${assessmentResults.userId} IN ${opts.scope.allowedClientIds} OR ${assessmentResults.userId} IS NULL)`,
      );
    }
  }

  const rows = await db
    .select({
      resultId: assessmentResults.id,
      userId: assessmentResults.userId,
      userName: users.name,
      assessmentId: assessmentResults.assessmentId,
      assessmentTitle: assessments.title,
      assessmentType: assessments.assessmentType,
      riskLevel: assessmentResults.riskLevel,
      totalScore: assessmentResults.totalScore,
      batchId: assessmentResults.batchId,
      createdAt: assessmentResults.createdAt,
      candidateId: candidatePool.id,
      candidateStatus: candidatePool.status,
      candidateKind: candidatePool.kind,
      suggestion: candidatePool.suggestion,
      priority: candidatePool.priority,
      latestEpisodeId: assessmentResults.careEpisodeId,
    })
    .from(assessmentResults)
    .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
    .leftJoin(users, eq(users.id, assessmentResults.userId))
    .leftJoin(
      candidatePool,
      and(
        eq(candidatePool.sourceResultId, assessmentResults.id),
        eq(candidatePool.orgId, orgId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(assessmentResults.createdAt));

  return (rows as any[]).map((r) => ({
    source: 'screening' as const,
    resultId: r.resultId,
    candidateId: r.candidateId ?? null,
    userId: r.userId,
    userName: r.userName,
    assessmentId: r.assessmentId,
    assessmentTitle: r.assessmentTitle,
    assessmentType: r.assessmentType,
    riskLevel: r.riskLevel,
    totalScore: r.totalScore,
    batchId: r.batchId,
    candidateStatus: r.candidateStatus ?? null,
    candidateKind: r.candidateKind ?? null,
    suggestion: r.suggestion ?? null,
    priority: r.priority ?? null,
    latestEpisodeId: r.latestEpisodeId,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}

async function queryManual(
  orgId: string,
  opts: TriageListOpts,
): Promise<TriageCandidateRow[]> {
  // "Manual" = candidates created outside the rule engine. Today nothing
  // writes this shape (rule-engine.service.ts always populates sourceRuleId),
  // so this query returns [] — but the branch is kept so a future
  // "手工增加研判对象" feature can plug in without a second API contract.
  const conditions = [
    eq(candidatePool.orgId, orgId),
    isNull(candidatePool.sourceRuleId),
  ];

  if (opts.level) conditions.push(sql`FALSE`); // manual rows have no risk level

  if (opts.scope?.type === 'assigned') {
    const ids = opts.scope.allowedClientIds ?? [];
    if (ids.length === 0) {
      conditions.push(sql`FALSE`);
    } else {
      conditions.push(sql`${candidatePool.clientUserId} IN ${ids}`);
    }
  }

  const rows = await db
    .select({
      candidateId: candidatePool.id,
      userId: candidatePool.clientUserId,
      userName: users.name,
      kind: candidatePool.kind,
      suggestion: candidatePool.suggestion,
      priority: candidatePool.priority,
      status: candidatePool.status,
      createdAt: candidatePool.createdAt,
    })
    .from(candidatePool)
    .leftJoin(users, eq(users.id, candidatePool.clientUserId))
    .where(and(...conditions))
    .orderBy(desc(candidatePool.createdAt));

  return (rows as any[]).map((r) => ({
    source: 'manual' as const,
    resultId: null,
    candidateId: r.candidateId,
    userId: r.userId,
    userName: r.userName,
    assessmentId: null,
    assessmentTitle: null,
    assessmentType: 'manual',
    riskLevel: null,
    totalScore: null,
    batchId: null,
    candidateStatus: r.status,
    candidateKind: r.kind,
    suggestion: r.suggestion,
    priority: r.priority,
    latestEpisodeId: null,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}

// ─── listTriageBuckets ───────────────────────────────────────────

export async function listTriageBuckets(
  orgId: string,
  opts: Pick<TriageListOpts, 'batchId' | 'assessmentId' | 'counselorId' | 'scope'>,
): Promise<TriageBuckets> {
  const conditions = [
    eq(assessmentResults.orgId, orgId),
    isNull(assessmentResults.deletedAt),
    eq(assessments.assessmentType, 'screening'),
  ];
  if (opts.batchId) conditions.push(eq(assessmentResults.batchId, opts.batchId));
  if (opts.assessmentId) conditions.push(eq(assessmentResults.assessmentId, opts.assessmentId));

  if (opts.scope?.type === 'assigned') {
    const ids = opts.scope.allowedClientIds ?? [];
    if (ids.length === 0) {
      conditions.push(isNull(assessmentResults.userId));
    } else {
      conditions.push(
        sql`(${assessmentResults.userId} IN ${ids} OR ${assessmentResults.userId} IS NULL)`,
      );
    }
  }

  const rows = await db
    .select({
      riskLevel: assessmentResults.riskLevel,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(assessmentResults)
    .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
    .where(and(...conditions));

  const buckets: TriageBuckets = {
    level_1: 0, level_2: 0, level_3: 0, level_4: 0, unrated: 0,
  };
  for (const r of rows as { riskLevel: string | null; count: number | string }[]) {
    const cnt = typeof r.count === 'string' ? parseInt(r.count, 10) : r.count;
    if (r.riskLevel === 'level_1') buckets.level_1 = cnt;
    else if (r.riskLevel === 'level_2') buckets.level_2 = cnt;
    else if (r.riskLevel === 'level_3') buckets.level_3 = cnt;
    else if (r.riskLevel === 'level_4') buckets.level_4 = cnt;
    else buckets.unrated = cnt;
  }
  return buckets;
}

// ─── listCandidatesForService ────────────────────────────────────
//
// Reverse-lookup: "who is queued for this specific team/course instance?"
// Powers the 候选 tab on GroupInstanceDetail / CourseInstanceDetail.
// Rows come from candidate_pool.targetGroupInstanceId /
// targetCourseInstanceId, populated by the rule engine when the authoring
// action.config includes the target id.

export interface ServiceCandidateRow {
  candidateId: string;
  kind: string;
  userId: string;
  userName: string | null;
  suggestion: string;
  reason: string | null;
  priority: string;
  status: string;
  sourceResultId: string | null;
  sourceRuleId: string | null;
  createdAt: Date;
}

export async function listCandidatesForService(params: {
  orgId: string;
  serviceType: 'group' | 'course';
  instanceId: string;
  status?: string;
}): Promise<ServiceCandidateRow[]> {
  const targetCol =
    params.serviceType === 'group'
      ? candidatePool.targetGroupInstanceId
      : candidatePool.targetCourseInstanceId;

  const conditions = [
    eq(candidatePool.orgId, params.orgId),
    eq(targetCol, params.instanceId),
  ];
  if (params.status) {
    conditions.push(eq(candidatePool.status, params.status));
  } else {
    conditions.push(eq(candidatePool.status, 'pending'));
  }

  const rows = await db
    .select({
      candidateId: candidatePool.id,
      kind: candidatePool.kind,
      userId: candidatePool.clientUserId,
      userName: users.name,
      suggestion: candidatePool.suggestion,
      reason: candidatePool.reason,
      priority: candidatePool.priority,
      status: candidatePool.status,
      sourceResultId: candidatePool.sourceResultId,
      sourceRuleId: candidatePool.sourceRuleId,
      createdAt: candidatePool.createdAt,
    })
    .from(candidatePool)
    .leftJoin(users, eq(users.id, candidatePool.clientUserId))
    .where(and(...conditions))
    .orderBy(desc(candidatePool.createdAt));

  return (rows as any[]).map((r) => ({
    candidateId: r.candidateId,
    kind: r.kind,
    userId: r.userId,
    userName: r.userName,
    suggestion: r.suggestion,
    reason: r.reason,
    priority: r.priority,
    status: r.status,
    sourceResultId: r.sourceResultId,
    sourceRuleId: r.sourceRuleId,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}

// ─── updateResultRiskLevel (action: confirm / adjust L level) ────

export async function updateResultRiskLevel(params: {
  orgId: string;
  resultId: string;
  riskLevel: string;
}): Promise<{ id: string; riskLevel: string | null }> {
  const [updated] = await db
    .update(assessmentResults)
    .set({ riskLevel: params.riskLevel })
    .where(
      and(
        eq(assessmentResults.id, params.resultId),
        eq(assessmentResults.orgId, params.orgId),
      ),
    )
    .returning({ id: assessmentResults.id, riskLevel: assessmentResults.riskLevel });
  return updated;
}
