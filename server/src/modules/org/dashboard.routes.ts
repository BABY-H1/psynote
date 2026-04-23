/**
 * Org admin dashboard aggregation.
 *
 * - `/dashboard/stats` — snapshot counts for the homepage (5 month-flow KPIs +
 *   supporting counts like unassignedCount). Kept for backward compatibility
 *   with School/Enterprise dashboards which use a subset.
 * - `/dashboard/kpi-delta?window=month|week` — 5 flow KPIs with current +
 *   previous-period-to-today window values for environmental-comparison tiles.
 *   month: 本月 vs 上月同期 (OrgAdmin / Enterprise)
 *   week:  本周 vs 上周同期 (School)
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { db } from '../../config/database.js';
import { sql, eq, and, count, or } from 'drizzle-orm';
import {
  orgMembers, clientAssignments, sessionNotes,
  groupInstances, courseInstances, assessmentResults,
} from '../../db/schema.js';
import { rejectClient } from '../../middleware/reject-client.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  app.get('/dashboard/stats', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;

    const [
      counselorRows,
      clientRows,
      sessionRows,
      unassignedRows,
      groupRows,
      courseRows,
      assessmentRows,
    ] = await Promise.all([
      // Active counselors (kept for School/Enterprise; no longer shown on OrgAdmin home)
      db.select({ value: count() })
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, orgId),
          eq(orgMembers.role, 'counselor'),
          eq(orgMembers.status, 'active'),
        )),

      // Active clients (distinct from assignments) — same caveat
      db.select({ value: sql<number>`count(DISTINCT ${clientAssignments.clientId})` })
        .from(clientAssignments)
        .where(eq(clientAssignments.orgId, orgId)),

      // This month's sessions
      db.select({ value: count() })
        .from(sessionNotes)
        .where(and(
          eq(sessionNotes.orgId, orgId),
          sql`${sessionNotes.createdAt} >= date_trunc('month', CURRENT_DATE)`,
        )),

      // Unassigned clients (used by OrgAdmin "待分配" action card)
      db.select({ value: count() })
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, orgId),
          eq(orgMembers.role, 'client'),
          eq(orgMembers.status, 'active'),
          sql`NOT EXISTS (
            SELECT 1 FROM client_assignments ca
            WHERE ca.org_id = ${orgId} AND ca.client_id = ${orgMembers.userId}
          )`,
        )),

      // Active group instances (recruiting or active)
      db.select({ value: count() })
        .from(groupInstances)
        .where(and(
          eq(groupInstances.orgId, orgId),
          or(
            eq(groupInstances.status, 'recruiting'),
            eq(groupInstances.status, 'active'),
          ),
        )),

      // Active course instances (draft or active)
      db.select({ value: count() })
        .from(courseInstances)
        .where(and(
          eq(courseInstances.orgId, orgId),
          or(
            eq(courseInstances.status, 'draft'),
            eq(courseInstances.status, 'active'),
          ),
        )),

      // This month's assessment results
      db.select({ value: count() })
        .from(assessmentResults)
        .where(and(
          eq(assessmentResults.orgId, orgId),
          sql`${assessmentResults.createdAt} >= date_trunc('month', CURRENT_DATE)`,
        )),
    ]);

    return {
      counselorCount: counselorRows[0]?.value ?? 0,
      clientCount: Number(clientRows[0]?.value ?? 0),
      monthlySessionCount: sessionRows[0]?.value ?? 0,
      unassignedCount: unassignedRows[0]?.value ?? 0,
      activeGroupCount: groupRows[0]?.value ?? 0,
      activeCourseCount: courseRows[0]?.value ?? 0,
      monthlyAssessmentCount: assessmentRows[0]?.value ?? 0,
    };
  });

  /**
   * 5 flow KPIs with current + previous-window values.
   *
   * window=month (default)
   *   current  = [date_trunc('month', CURRENT_DATE), CURRENT_DATE + 1]
   *   previous = month-1 from day 1 to day-of-month (e.g. today 21st → Mar 1–21 vs Apr 1–21)
   * window=week
   *   current  = [date_trunc('week', CURRENT_DATE), CURRENT_DATE + 1]
   *   previous = previous ISO week from Monday to same weekday
   *
   * For "进行中团辅/课程" (stock-looking but treated here as flow): we count
   * instances whose status is active/recruiting AND createdAt is within the
   * window. v1 approximation.
   */
  app.get('/dashboard/kpi-delta', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const qWindow = (request.query as { window?: string })?.window === 'week' ? 'week' : 'month';

    const windowExpr = (start: string, end: string) => ({
      start: sql.raw(start),
      end: sql.raw(end),
    });

    const CUR = qWindow === 'week'
      ? windowExpr(
          `date_trunc('week', CURRENT_DATE)`,
          `(CURRENT_DATE + INTERVAL '1 day')`,
        )
      : windowExpr(
          `date_trunc('month', CURRENT_DATE)`,
          `(CURRENT_DATE + INTERVAL '1 day')`,
        );
    const PREV = qWindow === 'week'
      ? windowExpr(
          `date_trunc('week', CURRENT_DATE - INTERVAL '1 week')`,
          `(date_trunc('week', CURRENT_DATE - INTERVAL '1 week') + (CURRENT_DATE - date_trunc('week', CURRENT_DATE)) + INTERVAL '1 day')`,
        )
      : windowExpr(
          `date_trunc('month', CURRENT_DATE - INTERVAL '1 month')`,
          `(date_trunc('month', CURRENT_DATE - INTERVAL '1 month') + (CURRENT_DATE - date_trunc('month', CURRENT_DATE)) + INTERVAL '1 day')`,
        );

    async function counts(kind: 'session' | 'assessment' | 'newClient' | 'groupActive' | 'courseActive') {
      // returns { current, previous }
      const select = (win: { start: any; end: any }) => {
        switch (kind) {
          case 'session':
            return db.select({ value: count() })
              .from(sessionNotes)
              .where(and(
                eq(sessionNotes.orgId, orgId),
                sql`${sessionNotes.createdAt} >= ${win.start}`,
                sql`${sessionNotes.createdAt} < ${win.end}`,
              ));
          case 'assessment':
            return db.select({ value: count() })
              .from(assessmentResults)
              .where(and(
                eq(assessmentResults.orgId, orgId),
                sql`${assessmentResults.createdAt} >= ${win.start}`,
                sql`${assessmentResults.createdAt} < ${win.end}`,
              ));
          case 'newClient':
            return db.select({ value: count() })
              .from(orgMembers)
              .where(and(
                eq(orgMembers.orgId, orgId),
                eq(orgMembers.role, 'client'),
                sql`${orgMembers.createdAt} >= ${win.start}`,
                sql`${orgMembers.createdAt} < ${win.end}`,
              ));
          case 'groupActive':
            // Approximation: instances in active/recruiting status whose
            // createdAt was before window end. For previous window, also
            // accept 'ended' (may have closed during the window).
            return db.select({ value: count() })
              .from(groupInstances)
              .where(and(
                eq(groupInstances.orgId, orgId),
                sql`${groupInstances.createdAt} < ${win.end}`,
                or(
                  eq(groupInstances.status, 'recruiting'),
                  eq(groupInstances.status, 'active'),
                  eq(groupInstances.status, 'ended'),
                ),
              ));
          case 'courseActive':
            return db.select({ value: count() })
              .from(courseInstances)
              .where(and(
                eq(courseInstances.orgId, orgId),
                sql`${courseInstances.createdAt} < ${win.end}`,
                or(
                  eq(courseInstances.status, 'draft'),
                  eq(courseInstances.status, 'active'),
                  eq(courseInstances.status, 'ended'),
                ),
              ));
        }
      };

      const [curRows, prevRows] = await Promise.all([select(CUR), select(PREV)]);
      return {
        current: Number(curRows[0]?.value ?? 0),
        previous: Number(prevRows[0]?.value ?? 0),
      };
    }

    const [newClient, session, groupActive, courseActive, assessment] = await Promise.all([
      counts('newClient'),
      counts('session'),
      counts('groupActive'),
      counts('courseActive'),
      counts('assessment'),
    ]);

    return {
      newClient,       // 本月新增来访者
      session,         // 本月个咨
      groupActive,     // 进行中团辅
      courseActive,    // 进行中课程
      assessment,      // 本月测评
    };
  });
}
