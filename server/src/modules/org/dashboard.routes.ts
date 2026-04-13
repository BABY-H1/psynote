/**
 * Phase 10 — Org admin dashboard aggregation endpoint.
 *
 * Returns key metrics for the org admin home page in a single request.
 */
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { db } from '../../config/database.js';
import { sql, eq, and, count, or, inArray } from 'drizzle-orm';
import {
  orgMembers, clientAssignments, sessionNotes, consentRecords,
  groupInstances, courseInstances, assessmentResults, serviceIntakes,
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

    // Run all counts in parallel using drizzle query builder
    const [
      counselorRows,
      clientRows,
      sessionRows,
      unassignedRows,
      pendingRows,
      consentRows,
      groupRows,
      courseRows,
      assessmentRows,
      intakeRows,
    ] = await Promise.all([
      // Active counselors
      db.select({ value: count() })
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, orgId),
          eq(orgMembers.role, 'counselor'),
          eq(orgMembers.status, 'active'),
        )),

      // Active clients (distinct from assignments)
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

      // Unassigned clients
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

      // Pending review notes
      db.select({ value: count() })
        .from(sessionNotes)
        .where(and(
          eq(sessionNotes.orgId, orgId),
          eq(sessionNotes.status, 'submitted_for_review'),
        )),

      // Consents expiring within 30 days
      db.select({ value: count() })
        .from(consentRecords)
        .where(and(
          eq(consentRecords.orgId, orgId),
          eq(consentRecords.status, 'active'),
          sql`${consentRecords.expiresAt} IS NOT NULL AND ${consentRecords.expiresAt} <= CURRENT_DATE + INTERVAL '30 days'`,
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

      // Pending service intakes
      db.select({ value: count() })
        .from(serviceIntakes)
        .where(and(
          eq(serviceIntakes.orgId, orgId),
          eq(serviceIntakes.status, 'pending'),
        )),
    ]);

    return {
      counselorCount: counselorRows[0]?.value ?? 0,
      clientCount: Number(clientRows[0]?.value ?? 0),
      monthlySessionCount: sessionRows[0]?.value ?? 0,
      unassignedCount: unassignedRows[0]?.value ?? 0,
      pendingNoteCount: pendingRows[0]?.value ?? 0,
      expiringConsentCount: consentRows[0]?.value ?? 0,
      activeGroupCount: groupRows[0]?.value ?? 0,
      activeCourseCount: courseRows[0]?.value ?? 0,
      monthlyAssessmentCount: assessmentRows[0]?.value ?? 0,
      pendingIntakeCount: intakeRows[0]?.value ?? 0,
    };
  });
}
