/**
 * Admin dashboard aggregation endpoint.
 *
 * GET /api/admin/dashboard — Returns tiles, trends, and alerts for the ops dashboard.
 */
import type { FastifyInstance } from 'fastify';
import { sql, eq, count, gte, and, isNotNull, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  organizations,
  orgMembers,
  users,
  careEpisodes,
  assessmentResults,
  auditLogs,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { verifyLicense } from '../../lib/license/verify.js';

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  app.get('/', async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // ── Tiles (parallel) ──────────────────────────────────────────
    const [
      activeOrgRows,
      monthlyActiveUserRows,
      monthlyCareEpisodeRows,
      monthlyAssessmentRows,
      allOrgs,
    ] = await Promise.all([
      // Active tenants: orgs with at least 1 active member
      db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(eq(orgMembers.status, 'active'))
        .groupBy(orgMembers.orgId),

      // Monthly active users (using last_login_at if available, fallback to all users)
      db.execute(sql`
        SELECT COUNT(*) as count FROM users
        WHERE last_login_at >= ${thirtyDaysAgoISO}::timestamptz
      `),

      // Monthly new care episodes
      db
        .select({ count: count() })
        .from(careEpisodes)
        .where(gte(careEpisodes.createdAt, startOfMonth)),

      // Monthly assessments
      db
        .select({ count: count() })
        .from(assessmentResults)
        .where(gte(assessmentResults.createdAt, startOfMonth)),

      // All orgs for license checking
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          licenseKey: organizations.licenseKey,
          createdAt: organizations.createdAt,
        })
        .from(organizations),
    ]);

    // Check licenses for expiring ones
    const licenseChecks = await Promise.all(
      allOrgs.map(async (org) => {
        if (!org.licenseKey) return { orgId: org.id, orgName: org.name, status: 'none' as const, expiresAt: null };
        const result = await verifyLicense(org.licenseKey, org.id);
        return {
          orgId: org.id,
          orgName: org.name,
          status: result.status,
          expiresAt: result.payload?.expiresAt ?? null,
        };
      }),
    );

    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringOrgs = licenseChecks.filter((l) => {
      if (l.status === 'expired') return true;
      if (l.status === 'active' && l.expiresAt) {
        return new Date(l.expiresAt) <= thirtyDaysFromNow;
      }
      return false;
    });

    // ── Trends ────────────────────────────────────────────────────

    // Tenant growth: monthly new orgs for last 12 months
    const tenantGrowthRows = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM organizations
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

    // User activity: monthly active users for last 6 months
    const userActivityRows = await db.execute(sql`
      SELECT
        TO_CHAR(last_login_at, 'YYYY-MM') as month,
        COUNT(DISTINCT id) as active_users
      FROM users
      WHERE last_login_at >= NOW() - INTERVAL '6 months'
        AND last_login_at IS NOT NULL
      GROUP BY TO_CHAR(last_login_at, 'YYYY-MM')
      ORDER BY month
    `);

    // ── Alerts ────────────────────────────────────────────────────

    // Dormant orgs: no active members
    const activeOrgIds = new Set(activeOrgRows.map((r) => r.orgId));
    const dormantOrgs = allOrgs
      .filter((org) => !activeOrgIds.has(org.id))
      .slice(0, 10)
      .map((org) => ({ orgId: org.id, orgName: org.name, lastActivity: '' }));

    // Recent audit events
    const recentAudit = await db
      .select({
        action: auditLogs.action,
        resource: auditLogs.resource,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);

    // ── Assemble response ─────────────────────────────────────────
    const monthlyActiveCount = Number(
      (monthlyActiveUserRows as any)?.[0]?.count ?? 0,
    );

    return {
      tiles: {
        activeTenants: activeOrgRows.length,
        monthlyActiveUsers: monthlyActiveCount,
        monthlyCareEpisodes: Number(monthlyCareEpisodeRows[0]?.count ?? 0),
        monthlyAssessments: Number(monthlyAssessmentRows[0]?.count ?? 0),
        expiringLicenses: expiringOrgs.length,
      },
      trends: {
        tenantGrowth: (tenantGrowthRows as any[]).map((r: any) => ({
          month: r.month,
          count: Number(r.count),
        })),
        userActivity: (userActivityRows as any[]).map((r: any) => ({
          month: r.month,
          activeUsers: Number(r.active_users),
        })),
      },
      alerts: {
        expiredLicenseOrgs: expiringOrgs.slice(0, 10).map((o) => ({
          orgId: o.orgId,
          orgName: o.orgName,
          expiresAt: o.expiresAt,
        })),
        dormantOrgs,
        recentAuditEvents: recentAudit.map((e) => ({
          action: e.action,
          resource: e.resource,
          createdAt: e.createdAt?.toISOString() ?? '',
          userName: e.userName ?? 'System',
        })),
      },
    };
  });
}
