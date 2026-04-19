/**
 * Org-level crisis dashboard aggregations (Phase 14b).
 *
 * Returns:
 *   - cards: 总数 / 处置中 / 待督导审核 / 本月结案 / 重新打开
 *   - byCounselor: 每位咨询师的开案/待审/已结案数(用于"谁负担最重")
 *   - bySource: candidate_pool 触发 vs. 手工开案
 *   - monthlyTrend: 最近 6 个月的 opened/closed 计数
 *   - recentActivity: 最新 10 条 crisis_* timeline 事件(全机构)
 *   - pendingSignOffList: 待审核案件简表(标题、提交人、提交时间)
 *
 * All aggregation is done in SQL (not JS) so performance stays flat as the
 * case count grows. Six queries run in parallel via Promise.all.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';

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
    bySource: ((bySourceRows as any).rows ?? bySourceRows ?? []).reduce(
      (acc: any, r: any) => {
        acc[r.source] = Number(r.cnt ?? 0);
        return acc;
      },
      { auto_candidate: 0, manual: 0 } as Record<string, number>,
    ),
    monthlyTrend: ((monthlyTrendRows as any).rows ?? monthlyTrendRows ?? []).map((r: any) => ({
      month: r.month,
      opened: Number(r.opened ?? 0),
      closed: Number(r.closed ?? 0),
    })),
    recentActivity: ((recentActivityRows as any).rows ?? recentActivityRows ?? []).map(
      (r: any) => ({
        id: r.id,
        eventType: r.event_type,
        title: r.title,
        summary: r.summary,
        careEpisodeId: r.care_episode_id,
        createdAt:
          typeof r.created_at === 'string'
            ? r.created_at
            : new Date(r.created_at).toISOString(),
        createdByName: r.created_by_name,
        clientName: r.client_name,
      }),
    ),
    pendingSignOffList: ((pendingSignOffRows as any).rows ?? pendingSignOffRows ?? []).map(
      (r: any) => ({
        caseId: r.id,
        episodeId: r.episode_id,
        submittedAt: r.submitted_at
          ? typeof r.submitted_at === 'string'
            ? r.submitted_at
            : new Date(r.submitted_at).toISOString()
          : null,
        counselorName: r.counselor_name,
        clientName: r.client_name,
        closureSummary: r.closure_summary,
      }),
    ),
  };
}
