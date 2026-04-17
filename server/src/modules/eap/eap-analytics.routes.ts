/**
 * EAP Analytics routes — HR 团体报表（聚合数据，无个人信息）
 *
 * Mounted at /api/orgs/:orgId/eap/analytics
 * Data source: ONLY eap_usage_events — physical privacy isolation
 *
 * GET /overview           — KPI tiles
 * GET /usage-trend        — Time series by event type
 * GET /risk-distribution  — Risk level distribution (k-anonymity k>=5)
 * GET /department         — Per-department breakdown
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, gte, sql, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  eapUsageEvents, eapEmployeeProfiles, eapCrisisAlerts,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';

// k-anonymity threshold: departments with fewer than K members get rolled into "其他"
const K_ANONYMITY = 5;

export async function eapAnalyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('enterprise'));
  app.addHook('preHandler', requireRole('org_admin'));

  // ─── Overview KPIs ───────────────────────────────────────────────
  /**
   * Phase 14d — add optional ?month=current query to filter all event counts
   * to the current calendar month only (for HR dashboard "本月 XX" tiles).
   * When not specified: accumulates across all time (original behavior).
   */
  app.get('/overview', async (request) => {
    const orgId = request.org!.orgId;
    const q = request.query as { month?: string };
    const monthOnly = q.month === 'current';

    // Total employees (never time-filtered)
    const [{ totalEmployees }] = await db
      .select({ totalEmployees: count() })
      .from(eapEmployeeProfiles)
      .where(eq(eapEmployeeProfiles.orgId, orgId));

    // Event counts by type
    const conditions = [eq(eapUsageEvents.enterpriseOrgId, orgId)];
    if (monthOnly) {
      conditions.push(sql`${eapUsageEvents.eventDate} >= date_trunc('month', CURRENT_DATE)`);
    }
    const eventCounts = await db
      .select({
        eventType: eapUsageEvents.eventType,
        count: count(),
      })
      .from(eapUsageEvents)
      .where(and(...conditions))
      .groupBy(eapUsageEvents.eventType);

    const countMap: Record<string, number> = {};
    for (const row of eventCounts) {
      countMap[row.eventType] = Number(row.count);
    }

    return {
      totalEmployees: Number(totalEmployees),
      assessmentsCompleted: countMap['assessment_completed'] || 0,
      sessionsBooked: countMap['session_booked'] || 0,
      sessionsCompleted: countMap['session_completed'] || 0,
      coursesEnrolled: countMap['course_enrolled'] || 0,
      groupsParticipated: countMap['group_participated'] || 0,
      crisisFlags: countMap['crisis_flagged'] || 0,
      monthOnly,
    };
  });

  // ─── Todos (Phase 14d, HR main page) ─────────────────────────────
  /**
   * Three HR action-oriented counts:
   *  - openCrisisCount:            eap_crisis_alerts.status='open' in this org
   *  - pendingEmployeeBindCount:  users with eap_usage_events but incomplete
   *                                eap_employee_profiles (missing employee_id
   *                                or department)
   *  - subscriptionEndsInDays:     days until license/subscription expires
   *                                (null if expired already or no data)
   */
  app.get('/todos', async (request) => {
    const orgId = request.org!.orgId;

    const [openRow] = await db
      .select({ value: count() })
      .from(eapCrisisAlerts)
      .where(and(
        eq(eapCrisisAlerts.enterpriseOrgId, orgId),
        eq(eapCrisisAlerts.status, 'open'),
      ));

    const [pendingBindRow] = await db.execute<{ cnt: string }>(sql`
      SELECT count(DISTINCT eue.user_id)::int AS cnt
      FROM eap_usage_events eue
      LEFT JOIN eap_employee_profiles eep
        ON eep.user_id = eue.user_id AND eep.org_id = eue.enterprise_org_id
      WHERE eue.enterprise_org_id = ${orgId}
        AND eue.user_id IS NOT NULL
        AND (
          eep.id IS NULL
          OR eep.employee_id IS NULL
          OR eep.department IS NULL
        )
    `).then((r: any) => r.rows ?? r);

    // Read license expiry from request.org.license (resolved by orgContextGuard)
    const lic = (request.org as any)?.license;
    const expiresAtStr = lic?.expiresAt as string | null | undefined;
    let subscriptionEndsInDays: number | null = null;
    let subscriptionEndsAt: string | null = null;
    if (expiresAtStr) {
      subscriptionEndsAt = expiresAtStr;
      const expiresAt = new Date(expiresAtStr).getTime();
      const days = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      subscriptionEndsInDays = days;
    }

    return {
      openCrisisCount: Number(openRow?.value ?? 0),
      pendingEmployeeBindCount: Number((pendingBindRow as any)?.cnt ?? 0),
      subscriptionEndsInDays,
      subscriptionEndsAt,
    };
  });

  // ─── Usage Trend (time series) ───────────────────────────────────
  app.get('/usage-trend', async (request) => {
    const orgId = request.org!.orgId;
    const query = request.query as { days?: string };
    const days = parseInt(query.days || '30');
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const trend = await db
      .select({
        eventDate: eapUsageEvents.eventDate,
        eventType: eapUsageEvents.eventType,
        count: count(),
      })
      .from(eapUsageEvents)
      .where(and(
        eq(eapUsageEvents.enterpriseOrgId, orgId),
        gte(eapUsageEvents.eventDate, sinceStr),
      ))
      .groupBy(eapUsageEvents.eventDate, eapUsageEvents.eventType)
      .orderBy(eapUsageEvents.eventDate);

    return {
      period: { days, since: sinceStr },
      data: trend.map((row) => ({
        date: row.eventDate,
        type: row.eventType,
        count: Number(row.count),
      })),
    };
  });

  // ─── Risk Distribution (k-anonymity enforced) ────────────────────
  app.get('/risk-distribution', async (request) => {
    const orgId = request.org!.orgId;

    // Overall distribution
    const riskDist = await db
      .select({
        riskLevel: eapUsageEvents.riskLevel,
        count: count(),
      })
      .from(eapUsageEvents)
      .where(and(
        eq(eapUsageEvents.enterpriseOrgId, orgId),
        eq(eapUsageEvents.eventType, 'assessment_completed'),
      ))
      .groupBy(eapUsageEvents.riskLevel);

    return {
      distribution: riskDist.map((row) => ({
        level: row.riskLevel || 'unknown',
        count: Number(row.count),
      })),
    };
  });

  // ─── Department Breakdown ────────────────────────────────────────
  app.get('/department', async (request) => {
    const orgId = request.org!.orgId;

    // Get department-level assessment stats
    const deptStats = await db
      .select({
        department: eapUsageEvents.department,
        riskLevel: eapUsageEvents.riskLevel,
        count: count(),
      })
      .from(eapUsageEvents)
      .where(and(
        eq(eapUsageEvents.enterpriseOrgId, orgId),
        eq(eapUsageEvents.eventType, 'assessment_completed'),
      ))
      .groupBy(eapUsageEvents.department, eapUsageEvents.riskLevel);

    // Department employee counts
    const deptCounts = await db
      .select({
        department: eapEmployeeProfiles.department,
        count: count(),
      })
      .from(eapEmployeeProfiles)
      .where(eq(eapEmployeeProfiles.orgId, orgId))
      .groupBy(eapEmployeeProfiles.department);

    const deptCountMap: Record<string, number> = {};
    for (const row of deptCounts) {
      deptCountMap[row.department || '未分配'] = Number(row.count);
    }

    // Group stats by department, apply k-anonymity
    const deptMap: Record<string, Record<string, number>> = {};
    for (const row of deptStats) {
      const dept = row.department || '未分配';
      if (!deptMap[dept]) deptMap[dept] = {};
      deptMap[dept][row.riskLevel || 'unknown'] = Number(row.count);
    }

    // Apply k-anonymity: departments with < K people → merge into "其他"
    const departments: Array<{
      name: string;
      employeeCount: number;
      riskDistribution: Record<string, number>;
    }> = [];

    const otherRisk: Record<string, number> = {};
    let otherEmployeeCount = 0;

    for (const [dept, risk] of Object.entries(deptMap)) {
      const empCount = deptCountMap[dept] || 0;
      if (empCount < K_ANONYMITY) {
        // Merge into "其他" for k-anonymity
        for (const [level, cnt] of Object.entries(risk)) {
          otherRisk[level] = (otherRisk[level] || 0) + cnt;
        }
        otherEmployeeCount += empCount;
      } else {
        departments.push({
          name: dept,
          employeeCount: empCount,
          riskDistribution: risk,
        });
      }
    }

    if (otherEmployeeCount > 0) {
      departments.push({
        name: '其他',
        employeeCount: otherEmployeeCount,
        riskDistribution: otherRisk,
      });
    }

    return { departments };
  });
}
