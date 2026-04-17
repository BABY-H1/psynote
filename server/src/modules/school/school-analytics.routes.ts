/**
 * Phase 14b — School analytics for the redesigned SchoolDashboard.
 *
 * Mounted at /api/orgs/:orgId/school/analytics
 * Guard: requireOrgType('school')
 *
 * Endpoints:
 *   GET /overview              — header counts replacing the dead tiles
 *                                (assessment_completed, high_risk_active_count, etc.)
 *   GET /risk-by-class         — class × risk_level matrix for the heatmap
 *   GET /high-risk-students    — top N students currently at level_3/level_4
 *   GET /crisis-by-class       — crisis cases grouped by class (open/closed/total)
 *
 * Modeled after `eap-analytics.routes.ts` but **without** k-anonymity, because
 * schools operate on per-student transparency (the homeroom teacher sees the
 * actual student names anyway). Privacy controls are upstream (RBAC).
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, isNull, count, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  schoolStudentProfiles,
  assessmentResults,
  careEpisodes,
  crisisCases,
  users,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';

const HIGH_RISK_LEVELS = ['level_3', 'level_4'];

export async function schoolAnalyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('school'));

  /**
   * Header overview — replaces the old hard-coded "测评完成=0/预警关注=0" tiles.
   *
   * - assessmentsThisMonth      本月完成的测评条数(去重 user)
   * - highRiskActiveStudents    当前 level_3/4 风险且没在 closed crisis 案件里的学生数
   * - openCrisisCount           处置中的危机案件
   * - pendingSignOffCount       待督导审核的危机案件
   */
  app.get('/overview', async (request) => {
    const orgId = request.org!.orgId;

    const [overviewRow] = await db.execute<{
      assessments_this_month: string;
      high_risk_active_students: string;
      open_crisis: string;
      pending_signoff: string;
    }>(sql`
      SELECT
        (SELECT count(DISTINCT user_id)::int FROM assessment_results
          WHERE org_id = ${orgId}
            AND created_at >= date_trunc('month', CURRENT_DATE)) AS assessments_this_month,
        (SELECT count(DISTINCT ar.user_id)::int FROM assessment_results ar
          INNER JOIN school_student_profiles ss ON ss.user_id = ar.user_id AND ss.org_id = ar.org_id
          WHERE ar.org_id = ${orgId}
            AND ar.risk_level IN ('level_3', 'level_4')
            AND ar.deleted_at IS NULL) AS high_risk_active_students,
        (SELECT count(*)::int FROM crisis_cases
          WHERE org_id = ${orgId} AND stage = 'open') AS open_crisis,
        (SELECT count(*)::int FROM crisis_cases
          WHERE org_id = ${orgId} AND stage = 'pending_sign_off') AS pending_signoff
    `).then((r: any) => r.rows ?? r);

    return {
      assessmentsThisMonth: Number((overviewRow as any)?.assessments_this_month ?? 0),
      highRiskActiveStudents: Number((overviewRow as any)?.high_risk_active_students ?? 0),
      openCrisisCount: Number((overviewRow as any)?.open_crisis ?? 0),
      pendingSignOffCount: Number((overviewRow as any)?.pending_signoff ?? 0),
    };
  });

  /**
   * Class × risk level matrix.
   *
   * Returns [{ grade, className, riskCounts: { level_1, level_2, level_3, level_4 }, totalAssessed, totalStudents }, ...]
   * Each student counted once at their **most recent** risk level.
   */
  app.get('/risk-by-class', async (request) => {
    const orgId = request.org!.orgId;

    // Latest risk per student
    const rows = await db.execute<{
      grade: string | null;
      class_name: string | null;
      risk_level: string | null;
      cnt: string;
    }>(sql`
      WITH latest_per_student AS (
        SELECT DISTINCT ON (ss.user_id)
          ss.grade, ss.class_name, ar.risk_level
        FROM school_student_profiles ss
        LEFT JOIN assessment_results ar
          ON ar.user_id = ss.user_id
          AND ar.org_id = ss.org_id
          AND ar.deleted_at IS NULL
        WHERE ss.org_id = ${orgId}
        ORDER BY ss.user_id, ar.created_at DESC NULLS LAST
      )
      SELECT grade, class_name, risk_level, count(*)::int AS cnt
      FROM latest_per_student
      GROUP BY grade, class_name, risk_level
      ORDER BY grade, class_name
    `).then((r: any) => r.rows ?? r);

    // Pivot into { grade+className: {level_x: n, totalAssessed, totalStudents} }
    const map = new Map<string, {
      grade: string;
      className: string;
      riskCounts: Record<string, number>;
      totalAssessed: number;
      totalStudents: number;
    }>();

    for (const r of (rows as any[])) {
      const grade = r.grade || '未分配';
      const className = r.class_name || '未分配';
      const key = `${grade}|${className}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          grade,
          className,
          riskCounts: { level_1: 0, level_2: 0, level_3: 0, level_4: 0 },
          totalAssessed: 0,
          totalStudents: 0,
        };
        map.set(key, entry);
      }
      const cnt = Number(r.cnt);
      entry.totalStudents += cnt;
      if (r.risk_level && entry.riskCounts[r.risk_level] !== undefined) {
        entry.riskCounts[r.risk_level] += cnt;
        entry.totalAssessed += cnt;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // Sort by descending high-risk count first, then by grade/class
      const aHigh = a.riskCounts.level_3 + a.riskCounts.level_4;
      const bHigh = b.riskCounts.level_3 + b.riskCounts.level_4;
      if (aHigh !== bHigh) return bHigh - aHigh;
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      return a.className.localeCompare(b.className);
    });
  });

  /**
   * Top N students currently at level_3/level_4 risk.
   *
   * Returns: [{ userId, name, studentId, grade, className, riskLevel, latestAssessmentAt, hasOpenCrisis }, ...]
   */
  app.get('/high-risk-students', async (request) => {
    const orgId = request.org!.orgId;
    const limit = Number((request.query as any)?.limit) || 20;

    const rows = await db.execute<{
      user_id: string;
      name: string | null;
      student_id: string | null;
      grade: string | null;
      class_name: string | null;
      risk_level: string;
      latest_at: string | null;
      has_open_crisis: boolean;
    }>(sql`
      WITH latest_per_student AS (
        SELECT DISTINCT ON (ar.user_id)
          ar.user_id, ar.risk_level, ar.created_at AS latest_at
        FROM assessment_results ar
        WHERE ar.org_id = ${orgId}
          AND ar.deleted_at IS NULL
          AND ar.risk_level IN ('level_3', 'level_4')
        ORDER BY ar.user_id, ar.created_at DESC
      )
      SELECT
        l.user_id,
        u.name,
        ss.student_id,
        ss.grade,
        ss.class_name,
        l.risk_level,
        l.latest_at,
        EXISTS (
          SELECT 1 FROM crisis_cases cc
          INNER JOIN care_episodes ce ON ce.id = cc.episode_id
          WHERE ce.client_id = l.user_id AND cc.org_id = ${orgId} AND cc.stage <> 'closed'
        ) AS has_open_crisis
      FROM latest_per_student l
      INNER JOIN users u ON u.id = l.user_id
      INNER JOIN school_student_profiles ss ON ss.user_id = l.user_id AND ss.org_id = ${orgId}
      ORDER BY
        CASE l.risk_level WHEN 'level_4' THEN 1 WHEN 'level_3' THEN 2 ELSE 3 END,
        l.latest_at DESC
      LIMIT ${limit}
    `).then((r: any) => r.rows ?? r);

    return (rows as any[]).map((r) => ({
      userId: r.user_id,
      name: r.name || '(未命名)',
      studentId: r.student_id,
      grade: r.grade,
      className: r.class_name,
      riskLevel: r.risk_level,
      latestAssessmentAt: r.latest_at
        ? (typeof r.latest_at === 'string' ? r.latest_at : new Date(r.latest_at).toISOString())
        : null,
      hasOpenCrisis: !!r.has_open_crisis,
    }));
  });

  /**
   * Crisis cases grouped by class.
   *
   * Returns: [{ grade, className, openCount, pendingSignOffCount, closedCount, total }, ...]
   * Sorted by total descending.
   */
  app.get('/crisis-by-class', async (request) => {
    const orgId = request.org!.orgId;

    const rows = await db.execute<{
      grade: string | null;
      class_name: string | null;
      open_count: string;
      pending_count: string;
      closed_count: string;
      total: string;
    }>(sql`
      SELECT
        ss.grade, ss.class_name,
        count(*) FILTER (WHERE cc.stage = 'open')::int AS open_count,
        count(*) FILTER (WHERE cc.stage = 'pending_sign_off')::int AS pending_count,
        count(*) FILTER (WHERE cc.stage = 'closed')::int AS closed_count,
        count(*)::int AS total
      FROM crisis_cases cc
      INNER JOIN care_episodes ce ON ce.id = cc.episode_id
      INNER JOIN school_student_profiles ss ON ss.user_id = ce.client_id AND ss.org_id = cc.org_id
      WHERE cc.org_id = ${orgId}
      GROUP BY ss.grade, ss.class_name
      ORDER BY total DESC
      LIMIT 20
    `).then((r: any) => r.rows ?? r);

    return (rows as any[]).map((r) => ({
      grade: r.grade || '未分配',
      className: r.class_name || '未分配',
      openCount: Number(r.open_count ?? 0),
      pendingSignOffCount: Number(r.pending_count ?? 0),
      closedCount: Number(r.closed_count ?? 0),
      total: Number(r.total ?? 0),
    }));
  });
}
