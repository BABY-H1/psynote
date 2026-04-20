/**
 * Admin dashboard aggregation endpoint.
 *
 * GET /api/admin/dashboard — Returns tiles, trends, and alerts for the
 * sysadmin "经营看板" home page.
 *
 * Focus is on business-ops signals for the platform operator: recent
 * license activity + per-org health snapshot. Narrower "dormant orgs"
 * and "recent audit events" slots from the earlier version were
 * replaced with richer `operationalOrgs` and `recentLicenseActivity`
 * — see 2026-04 dashboard refocus.
 */
import type { FastifyInstance } from 'fastify';
import { sql, eq, count, gte } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  organizations,
  orgMembers,
  careEpisodes,
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
      allOrgs,
    ] = await Promise.all([
      // Active tenants: orgs with at least 1 active member
      db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(eq(orgMembers.status, 'active'))
        .groupBy(orgMembers.orgId),

      // Monthly active users (last 30d by last_login_at)
      db.execute(sql`
        SELECT COUNT(*) as count FROM users
        WHERE last_login_at >= ${thirtyDaysAgoISO}::timestamptz
      `),

      // Monthly new care episodes
      db
        .select({ count: count() })
        .from(careEpisodes)
        .where(gte(careEpisodes.createdAt, startOfMonth)),

      // All orgs for license verification (shared with operationalOrgs below)
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          licenseKey: organizations.licenseKey,
          plan: organizations.plan,
          createdAt: organizations.createdAt,
        })
        .from(organizations),
    ]);

    // Verify each org's license once — reused by expiringLicenses tile,
    // expiredLicenseOrgs alert, and operationalOrgs card.
    const licenseChecks = await Promise.all(
      allOrgs.map(async (org) => {
        if (!org.licenseKey) {
          return { orgId: org.id, orgName: org.name, status: 'none' as const, tier: null, expiresAt: null };
        }
        const r = await verifyLicense(org.licenseKey, org.id);
        return {
          orgId: org.id,
          orgName: org.name,
          status: r.status,
          tier: r.payload?.tier ?? null,
          expiresAt: r.payload?.expiresAt ?? null,
        };
      }),
    );
    const licenseByOrgId = new Map(licenseChecks.map((l) => [l.orgId, l]));

    // Expiring = expired OR expires in next 30 days
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringOrgs = licenseChecks.filter((l) => {
      if (l.status === 'expired') return true;
      if (l.status === 'active' && l.expiresAt) {
        return new Date(l.expiresAt) <= thirtyDaysFromNow;
      }
      return false;
    });

    // ── Trends ────────────────────────────────────────────────────

    const tenantGrowthRows = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM organizations
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

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

    // Recent license activity — issued / renewed / modified / revoked /
    // activated. Joined with org name so the UI row can render
    // {action | org | time} without a second round-trip.
    //
    // NOTE: admin-license.routes.ts runs without orgContextGuard, so rows
    // it writes leave `audit_logs.org_id` NULL and stash the tenant in
    // `resource_id` (resource='organization'). We COALESCE both columns
    // when joining the org name; the single org-side `license.activated`
    // call does carry org_id.
    const recentLicenseActivityRows = await db.execute(sql`
      SELECT
        al.action,
        COALESCE(al.org_id, al.resource_id) AS org_id,
        o.name AS org_name,
        al.created_at
      FROM audit_logs al
      LEFT JOIN organizations o
        ON o.id = COALESCE(al.org_id, al.resource_id)
      WHERE al.action LIKE 'license.%'
      ORDER BY al.created_at DESC
      LIMIT 10
    `);

    const recentLicenseActivity = (recentLicenseActivityRows as any[]).map((r: any) => ({
      action: r.action as string,
      orgId: (r.org_id as string | null) ?? null,
      orgName: (r.org_name as string | null) ?? '已删除的机构',
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    }));

    // Per-org operational snapshot — one aggregated query that the UI
    // renders as a scannable table. Sorted by last audit-log activity
    // so the operator sees the busiest orgs first; orgs with no
    // activity fall to the bottom via NULLS LAST.
    const operationalOrgsRows = await db.execute(sql`
      WITH active_members AS (
        SELECT org_id, COUNT(*) AS active_member_count
        FROM org_members
        WHERE status = 'active'
        GROUP BY org_id
      ),
      monthly_eps AS (
        SELECT org_id, COUNT(*) AS monthly_episode_count
        FROM care_episodes
        WHERE created_at >= ${startOfMonth.toISOString()}::timestamptz
        GROUP BY org_id
      ),
      last_activity AS (
        SELECT org_id, MAX(created_at) AS last_activity_at
        FROM audit_logs
        WHERE org_id IS NOT NULL
        GROUP BY org_id
      )
      SELECT
        o.id,
        o.name,
        o.slug,
        COALESCE(am.active_member_count, 0)::int AS active_member_count,
        COALESCE(me.monthly_episode_count, 0)::int AS monthly_episode_count,
        la.last_activity_at
      FROM organizations o
      LEFT JOIN active_members am ON am.org_id = o.id
      LEFT JOIN monthly_eps     me ON me.org_id = o.id
      LEFT JOIN last_activity   la ON la.org_id = o.id
      ORDER BY la.last_activity_at DESC NULLS LAST, o.created_at DESC
      LIMIT 20
    `);

    const operationalOrgs = (operationalOrgsRows as any[]).map((r: any) => {
      const lic = licenseByOrgId.get(r.id);
      return {
        orgId: r.id,
        orgName: r.name,
        slug: r.slug,
        activeMemberCount: Number(r.active_member_count),
        monthlyEpisodes: Number(r.monthly_episode_count),
        tier: lic?.tier ?? null,
        licenseStatus: lic?.status ?? 'none',
        lastActivityAt: r.last_activity_at
          ? (r.last_activity_at instanceof Date
              ? r.last_activity_at.toISOString()
              : String(r.last_activity_at))
          : null,
      };
    });

    // ── Assemble response ─────────────────────────────────────────
    const monthlyActiveCount = Number(
      (monthlyActiveUserRows as any)?.[0]?.count ?? 0,
    );

    return {
      tiles: {
        activeTenants: activeOrgRows.length,
        monthlyActiveUsers: monthlyActiveCount,
        monthlyCareEpisodes: Number(monthlyCareEpisodeRows[0]?.count ?? 0),
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
        // Already serialized upstream — objects match the client's
        // DashboardData.alerts.recentLicenseActivity shape verbatim.
        recentLicenseActivity,
        operationalOrgs,
      },
    };
  });
}
