/**
 * Crisis handling case service — Phase 13.
 *
 * Workflow:
 *   candidate accept → createFromCandidate()
 *     → creates care_episode (interventionType='crisis', currentRisk='level_4')
 *     → creates crisis_case (stage='open', empty checklist)
 *     → writes candidate_pool.resolvedRefType='crisis_case' back
 *     → writes careTimeline event 'crisis_opened'
 *
 *   counselor ticks a step → updateChecklistStep()
 *     → merges the step into `checklist` jsonb
 *     → writes a `crisis_step_*` event to care_timeline so the
 *       existing enriched-timeline UI shows processing history
 *
 *   counselor done → submitForSignOff()
 *     → stage='pending_sign_off', notifies all supervisors in the org
 *
 *   supervisor approves → signOff(approve=true)
 *     → stage='closed', closes the care_episode too
 *
 *   supervisor bounces → signOff(approve=false)
 *     → stage='reopened' (back to open semantically), counselor can resubmit
 *
 * Design note: we never contact parents or external agencies from here. Every
 * "contact" step is pure record-keeping; the counselor handles the actual
 * communication offline (phone/WeChat/face-to-face).
 */
import { eq, and, desc, sql, gte, inArray, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  crisisCases,
  careEpisodes,
  careTimeline,
  candidatePool,
  users,
  orgMembers,
  notifications,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type {
  CrisisCase,
  CrisisChecklist,
  CrisisChecklistStepKey,
  CrisisCaseStage,
  ReinterviewStep,
  ParentContactStep,
  DocumentsStep,
  ReferralStep,
  FollowUpStep,
} from '@psynote/shared';
import { CRISIS_REQUIRED_STEPS, CRISIS_STEP_LABELS } from '@psynote/shared';

type StepPayload =
  | ReinterviewStep
  | ParentContactStep
  | DocumentsStep
  | ReferralStep
  | FollowUpStep;

/**
 * Atomically create a care_episode + crisis_case from an accepted candidate.
 * Called from workflow.routes.ts when a crisis_candidate is accepted.
 */
export async function createFromCandidate(input: {
  orgId: string;
  candidateId: string;
  acceptorUserId: string;
}): Promise<{ episodeId: string; crisisCaseId: string }> {
  // Load candidate
  const [cand] = await db
    .select()
    .from(candidatePool)
    .where(and(
      eq(candidatePool.id, input.candidateId),
      eq(candidatePool.orgId, input.orgId),
    ))
    .limit(1);
  if (!cand) throw new NotFoundError('Candidate', input.candidateId);
  if (cand.kind !== 'crisis_candidate') {
    throw new ValidationError('仅 crisis_candidate 可以创建危机案件');
  }
  if (cand.status !== 'pending') {
    throw new ValidationError(`候选已被处理(status=${cand.status})`);
  }

  // 1. Create care_episode (crisis, level_4)
  const [episode] = await db.insert(careEpisodes).values({
    orgId: input.orgId,
    clientId: cand.clientUserId,
    counselorId: input.acceptorUserId,
    chiefComplaint: cand.suggestion,
    currentRisk: 'level_4',
    interventionType: 'crisis',
    status: 'active',
  }).returning();

  // 2. Create crisis_case
  const [crisis] = await db.insert(crisisCases).values({
    orgId: input.orgId,
    episodeId: episode.id,
    candidateId: cand.id,
    stage: 'open',
    checklist: {},
    createdBy: input.acceptorUserId,
  }).returning();

  // 3. Timeline event — this appears in the enriched timeline UI automatically
  await db.insert(careTimeline).values({
    careEpisodeId: episode.id,
    eventType: 'crisis_opened',
    refId: crisis.id,
    title: '危机处置案件已开启',
    summary: cand.reason || '由规则引擎识别为危机候选,咨询师接手处置',
    metadata: {
      candidateId: cand.id,
      sourceRuleId: cand.sourceRuleId,
      priority: cand.priority,
    },
    createdBy: input.acceptorUserId,
  });

  return { episodeId: episode.id, crisisCaseId: crisis.id };
}

export async function getCaseById(orgId: string, caseId: string): Promise<CrisisCase> {
  const [row] = await db
    .select()
    .from(crisisCases)
    .where(and(eq(crisisCases.id, caseId), eq(crisisCases.orgId, orgId)))
    .limit(1);
  if (!row) throw new NotFoundError('CrisisCase', caseId);
  return toCrisisCase(row);
}

export async function getCaseByEpisode(orgId: string, episodeId: string): Promise<CrisisCase | null> {
  const [row] = await db
    .select()
    .from(crisisCases)
    .where(and(eq(crisisCases.episodeId, episodeId), eq(crisisCases.orgId, orgId)))
    .limit(1);
  return row ? toCrisisCase(row) : null;
}

/** List all cases the user (usually a supervisor) has visibility on. */
export async function listCases(orgId: string, filters?: { stage?: CrisisCaseStage }) {
  const conditions = [eq(crisisCases.orgId, orgId)];
  if (filters?.stage) conditions.push(eq(crisisCases.stage, filters.stage));

  const rows = await db
    .select()
    .from(crisisCases)
    .where(and(...conditions))
    .orderBy(desc(crisisCases.updatedAt));
  return rows.map(toCrisisCase);
}

export async function updateChecklistStep(input: {
  orgId: string;
  caseId: string;
  stepKey: CrisisChecklistStepKey;
  payload: StepPayload;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage === 'closed') {
    throw new ValidationError('案件已结案,无法再修改清单');
  }

  const merged: CrisisChecklist = { ...existing.checklist };
  const nextStep: StepPayload = {
    ...(merged as Record<string, StepPayload | undefined>)[input.stepKey],
    ...input.payload,
    completedAt: input.payload.completedAt ?? (input.payload.done ? new Date().toISOString() : null),
  } as StepPayload;
  (merged as Record<string, StepPayload>)[input.stepKey] = nextStep;

  const [updated] = await db
    .update(crisisCases)
    .set({ checklist: merged, updatedAt: new Date() })
    .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
    .returning();

  // Write a timeline event so the case history shows each step transition
  await db.insert(careTimeline).values({
    careEpisodeId: existing.episodeId,
    eventType: `crisis_step_${input.stepKey}`,
    refId: input.caseId,
    title: buildStepTimelineTitle(input.stepKey, nextStep),
    summary: buildStepTimelineSummary(input.stepKey, nextStep),
    metadata: { stepKey: input.stepKey, payload: input.payload },
    createdBy: input.userId,
  });

  return toCrisisCase(updated);
}

export async function submitForSignOff(input: {
  orgId: string;
  caseId: string;
  closureSummary: string;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage === 'closed') throw new ValidationError('案件已结案');
  if (existing.stage === 'pending_sign_off') throw new ValidationError('案件已提交,等待督导审核');

  // Validate required steps are completed
  const missing = CRISIS_REQUIRED_STEPS.filter((k) => {
    const s = existing.checklist[k];
    return !s || !s.done;
  });
  if (missing.length > 0) {
    throw new ValidationError(
      `以下必做步骤未完成: ${missing.map((k) => CRISIS_STEP_LABELS[k]).join('、')}`,
    );
  }
  if (!input.closureSummary?.trim()) {
    throw new ValidationError('请填写结案摘要');
  }

  const now = new Date();
  const [updated] = await db
    .update(crisisCases)
    .set({
      stage: 'pending_sign_off',
      closureSummary: input.closureSummary.trim(),
      submittedForSignOffAt: now,
      updatedAt: now,
    })
    .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
    .returning();

  // Timeline event
  await db.insert(careTimeline).values({
    careEpisodeId: existing.episodeId,
    eventType: 'crisis_submitted_for_sign_off',
    refId: input.caseId,
    title: '已提交督导审核',
    summary: input.closureSummary.trim(),
    createdBy: input.userId,
  });

  // Notify all supervisors in the org
  await notifySupervisors(input.orgId, {
    type: 'crisis_sign_off_request',
    title: '危机案件等待您审核',
    body: input.closureSummary.trim().slice(0, 120),
    refType: 'crisis_case',
    refId: input.caseId,
  });

  return toCrisisCase(updated);
}

export async function signOff(input: {
  orgId: string;
  caseId: string;
  approve: boolean;
  supervisorNote?: string;
  userId: string;
}): Promise<CrisisCase> {
  const existing = await getCaseById(input.orgId, input.caseId);
  if (existing.stage !== 'pending_sign_off') {
    throw new ValidationError(`只有 pending_sign_off 状态的案件可以审核(当前: ${existing.stage})`);
  }

  const now = new Date();

  if (input.approve) {
    // Close case + close the underlying careEpisode
    const [updated] = await db
      .update(crisisCases)
      .set({
        stage: 'closed',
        signedOffBy: input.userId,
        signedOffAt: now,
        supervisorNote: input.supervisorNote || null,
        updatedAt: now,
      })
      .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
      .returning();

    await db
      .update(careEpisodes)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(careEpisodes.id, existing.episodeId));

    await db.insert(careTimeline).values({
      careEpisodeId: existing.episodeId,
      eventType: 'crisis_signed_off',
      refId: input.caseId,
      title: '督导已确认结案',
      summary: input.supervisorNote || '',
      createdBy: input.userId,
    });

    // Notify the counselor
    if (existing.createdBy) {
      await db.insert(notifications).values({
        orgId: input.orgId,
        userId: existing.createdBy,
        type: 'crisis_signed_off',
        title: '危机案件已结案',
        body: '督导已确认您提交的危机处置案件结案。',
        refType: 'crisis_case',
        refId: input.caseId,
      });
    }

    return toCrisisCase(updated);
  } else {
    // Bounce back
    const [updated] = await db
      .update(crisisCases)
      .set({
        stage: 'reopened',
        supervisorNote: input.supervisorNote || null,
        submittedForSignOffAt: null,
        updatedAt: now,
      })
      .where(and(eq(crisisCases.id, input.caseId), eq(crisisCases.orgId, input.orgId)))
      .returning();

    await db.insert(careTimeline).values({
      careEpisodeId: existing.episodeId,
      eventType: 'crisis_reopened',
      refId: input.caseId,
      title: '督导退回修改',
      summary: input.supervisorNote || '',
      createdBy: input.userId,
    });

    // Notify the counselor
    if (existing.createdBy) {
      await db.insert(notifications).values({
        orgId: input.orgId,
        userId: existing.createdBy,
        type: 'crisis_reopened',
        title: '危机案件已退回修改',
        body: input.supervisorNote?.slice(0, 120) || '请根据督导反馈修改后重新提交。',
        refType: 'crisis_case',
        refId: input.caseId,
      });
    }

    return toCrisisCase(updated);
  }
}

// ─── Helpers ───────────────────────────────────────────────────

async function notifySupervisors(orgId: string, notif: {
  type: string;
  title: string;
  body?: string;
  refType?: string;
  refId?: string;
}) {
  // 这个系统里没有独立的 'supervisor' 角色 —— 督导职能由 org_admin 或带
  // fullPracticeAccess 标记的 counselor 承担(详见 middleware/data-scope.ts).
  // 我们用同一集合作为督导候选:给所有 org_admin 和 fullPracticeAccess=true
  // 的咨询师都发一条待审核通知,由组织里谁先看到谁处理.
  const candidates = await db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      fullPracticeAccess: orgMembers.fullPracticeAccess,
    })
    .from(orgMembers)
    .where(and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.status, 'active'),
    ));

  const supervisors = candidates.filter(
    (m) => m.role === 'org_admin' || (m.role === 'counselor' && m.fullPracticeAccess),
  );

  if (supervisors.length === 0) return;

  await db.insert(notifications).values(supervisors.map((s) => ({
    orgId,
    userId: s.userId,
    type: notif.type,
    title: notif.title,
    body: notif.body,
    refType: notif.refType,
    refId: notif.refId,
  })));
}

function buildStepTimelineTitle(stepKey: CrisisChecklistStepKey, step: StepPayload): string {
  const label = CRISIS_STEP_LABELS[stepKey];
  if (step.skipped) return `${label}(已跳过)`;
  if (step.done) return `${label}已完成`;
  return `${label}已更新`;
}

function buildStepTimelineSummary(stepKey: CrisisChecklistStepKey, step: StepPayload): string {
  if (step.skipped && step.skipReason) return `跳过原因: ${step.skipReason}`;
  if (stepKey === 'parentContact') {
    const p = step as ParentContactStep;
    const parts = [p.method && `方式: ${p.method}`, p.contactName && `对象: ${p.contactName}`, p.summary].filter(Boolean);
    return parts.join(' · ');
  }
  const anyStep = step as { summary?: string };
  return anyStep.summary || '';
}

function toCrisisCase(row: typeof crisisCases.$inferSelect): CrisisCase {
  return {
    id: row.id,
    orgId: row.orgId,
    episodeId: row.episodeId,
    candidateId: row.candidateId,
    stage: row.stage as CrisisCaseStage,
    checklist: (row.checklist || {}) as CrisisChecklist,
    closureSummary: row.closureSummary,
    supervisorNote: row.supervisorNote,
    signedOffBy: row.signedOffBy,
    signedOffAt: row.signedOffAt ? row.signedOffAt.toISOString() : null,
    submittedForSignOffAt: row.submittedForSignOffAt ? row.submittedForSignOffAt.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Dashboard stats (Phase 14b) ────────────────────────────────

/**
 * Org-level crisis dashboard aggregations.
 *
 * Returns:
 *   - cards: 总数 / 处置中 / 待督导审核 / 本月结案 / 重新打开
 *   - byCounselor: 每位咨询师的开案/待审/已结案数(用于"谁负担最重")
 *   - bySource: candidate_pool 触发 vs. 手工开案
 *   - monthlyTrend: 最近 6 个月的 opened/closed 计数
 *   - recentActivity: 最新 10 条 crisis_* timeline 事件(全机构)
 *   - pendingSignOffList: 待审核案件简表(标题、提交人、提交时间)
 *
 * 全部走 SQL 聚合,不在内存里 JS 加总,避免 case 数量上去后慢.
 */
export async function getDashboardStats(orgId: string) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    cardCounts,
    byCounselorRows,
    bySourceRows,
    monthlyTrendRows,
    recentActivityRows,
    pendingSignOffRows,
  ] = await Promise.all([
    // ── 卡片计数(单条 SQL，按 stage 分组 + 候选池待处置计数) ──
    db.execute<{
      total: string;
      open_count: string;
      pending_count: string;
      closed_this_month: string;
      reopened_count: string;
      pending_candidate_count: string;
    }>(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE stage = 'open')::int AS open_count,
        count(*) FILTER (WHERE stage = 'pending_sign_off')::int AS pending_count,
        count(*) FILTER (WHERE stage = 'closed' AND signed_off_at >= date_trunc('month', CURRENT_DATE))::int AS closed_this_month,
        count(*) FILTER (WHERE stage = 'reopened')::int AS reopened_count,
        (SELECT count(*)::int FROM candidate_pool
          WHERE org_id = ${orgId}
            AND kind = 'crisis_candidate'
            AND status = 'pending') AS pending_candidate_count
      FROM crisis_cases
      WHERE org_id = ${orgId}
    `),

    // ── 按咨询师分布(JOIN users for name)──
    db.execute<{
      counselor_id: string;
      counselor_name: string | null;
      open_count: string;
      pending_count: string;
      closed_count: string;
      total: string;
    }>(sql`
      SELECT
        cc.created_by AS counselor_id,
        u.name AS counselor_name,
        count(*) FILTER (WHERE cc.stage = 'open')::int AS open_count,
        count(*) FILTER (WHERE cc.stage = 'pending_sign_off')::int AS pending_count,
        count(*) FILTER (WHERE cc.stage = 'closed')::int AS closed_count,
        count(*)::int AS total
      FROM crisis_cases cc
      LEFT JOIN users u ON u.id = cc.created_by
      WHERE cc.org_id = ${orgId} AND cc.created_by IS NOT NULL
      GROUP BY cc.created_by, u.name
      ORDER BY open_count DESC, pending_count DESC, total DESC
      LIMIT 20
    `),

    // ── 按来源分布(candidate vs 手工)──
    db.execute<{ source: string; cnt: string }>(sql`
      SELECT
        CASE WHEN candidate_id IS NULL THEN 'manual' ELSE 'auto_candidate' END AS source,
        count(*)::int AS cnt
      FROM crisis_cases
      WHERE org_id = ${orgId}
      GROUP BY source
    `),

    // ── 最近 6 个月开案/结案趋势 ──
    db.execute<{
      month: string;
      opened: string;
      closed: string;
    }>(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', ${sixMonthsAgo.toISOString()}::timestamptz),
          date_trunc('month', CURRENT_DATE),
          interval '1 month'
        ) AS month_start
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        count(o.id)::int AS opened,
        count(c.id)::int AS closed
      FROM months m
      LEFT JOIN crisis_cases o
        ON o.org_id = ${orgId}
        AND o.created_at >= m.month_start
        AND o.created_at < m.month_start + interval '1 month'
      LEFT JOIN crisis_cases c
        ON c.org_id = ${orgId}
        AND c.signed_off_at >= m.month_start
        AND c.signed_off_at < m.month_start + interval '1 month'
        AND c.stage = 'closed'
      GROUP BY m.month_start
      ORDER BY m.month_start
    `),

    // ── 最近 10 条 crisis 时间线事件(跨所有 episode)──
    db.execute<{
      id: string;
      event_type: string;
      title: string | null;
      summary: string | null;
      care_episode_id: string;
      created_at: string;
      created_by_name: string | null;
      client_name: string | null;
    }>(sql`
      SELECT
        ct.id, ct.event_type, ct.title, ct.summary,
        ct.care_episode_id, ct.created_at,
        u.name AS created_by_name,
        cu.name AS client_name
      FROM care_timeline ct
      INNER JOIN care_episodes ce ON ce.id = ct.care_episode_id
      LEFT JOIN users u ON u.id = ct.created_by
      LEFT JOIN users cu ON cu.id = ce.client_id
      WHERE ce.org_id = ${orgId}
        AND ct.event_type LIKE 'crisis_%'
      ORDER BY ct.created_at DESC
      LIMIT 10
    `),

    // ── 待审核案件简表 ──
    db.execute<{
      id: string;
      episode_id: string;
      submitted_at: string | null;
      counselor_name: string | null;
      client_name: string | null;
      closure_summary: string | null;
    }>(sql`
      SELECT
        cc.id, cc.episode_id, cc.submitted_for_sign_off_at AS submitted_at,
        cc.closure_summary,
        u.name AS counselor_name,
        cu.name AS client_name
      FROM crisis_cases cc
      INNER JOIN care_episodes ce ON ce.id = cc.episode_id
      LEFT JOIN users u ON u.id = cc.created_by
      LEFT JOIN users cu ON cu.id = ce.client_id
      WHERE cc.org_id = ${orgId} AND cc.stage = 'pending_sign_off'
      ORDER BY cc.submitted_for_sign_off_at ASC
      LIMIT 20
    `),
  ]);

  const card = (cardCounts as any).rows?.[0] ?? (cardCounts as any)[0] ?? {};

  return {
    cards: {
      total: Number((card as any).total ?? 0),
      openCount: Number((card as any).open_count ?? 0),
      pendingCandidateCount: Number((card as any).pending_candidate_count ?? 0),
      pendingSignOffCount: Number((card as any).pending_count ?? 0),
      closedThisMonth: Number((card as any).closed_this_month ?? 0),
      reopenedCount: Number((card as any).reopened_count ?? 0),
    },
    byCounselor: ((byCounselorRows as any).rows ?? byCounselorRows ?? []).map((r: any) => ({
      counselorId: r.counselor_id,
      counselorName: r.counselor_name || '(未命名)',
      openCount: Number(r.open_count ?? 0),
      pendingCount: Number(r.pending_count ?? 0),
      closedCount: Number(r.closed_count ?? 0),
      total: Number(r.total ?? 0),
    })),
    bySource: ((bySourceRows as any).rows ?? bySourceRows ?? []).reduce((acc: any, r: any) => {
      acc[r.source] = Number(r.cnt ?? 0);
      return acc;
    }, { auto_candidate: 0, manual: 0 } as Record<string, number>),
    monthlyTrend: ((monthlyTrendRows as any).rows ?? monthlyTrendRows ?? []).map((r: any) => ({
      month: r.month,
      opened: Number(r.opened ?? 0),
      closed: Number(r.closed ?? 0),
    })),
    recentActivity: ((recentActivityRows as any).rows ?? recentActivityRows ?? []).map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      title: r.title,
      summary: r.summary,
      careEpisodeId: r.care_episode_id,
      createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
      createdByName: r.created_by_name,
      clientName: r.client_name,
    })),
    pendingSignOffList: ((pendingSignOffRows as any).rows ?? pendingSignOffRows ?? []).map((r: any) => ({
      caseId: r.id,
      episodeId: r.episode_id,
      submittedAt: r.submitted_at
        ? (typeof r.submitted_at === 'string' ? r.submitted_at : new Date(r.submitted_at).toISOString())
        : null,
      counselorName: r.counselor_name,
      clientName: r.client_name,
      closureSummary: r.closure_summary,
    })),
  };
}
