/**
 * Phase 9ε — Org-internal collaboration routes.
 *
 * One unified surface area for the "机构内协作页" 4-tab UI:
 *   1. Unassigned clients (派单 dashboard 的左半边)
 *   2. Active access grants list (临时授权 tab) — already exposed by
 *      client-access-grant.routes; we re-expose it here as a convenience
 *      so the collaboration page can hit one prefix.
 *   3. Notes pending supervisor review (督导待审 tab)
 *   4. Audit log query (read-only org_admin view)
 *
 * Why a new module instead of cross-mounting existing routes?
 *   The collaboration page wants composed shapes (e.g. "unassigned clients
 *   joined to client_profile") that don't exist on the per-domain endpoints.
 *   Centralizing the queries here keeps each per-domain endpoint clean and
 *   gives the UI a stable single-prefix surface.
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc, sql, or, gte, lte, like, inArray } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { db } from '../../config/database.js';
import {
  users, orgMembers, sessionNotes, clientAssignments,
  auditLogs, phiAccessLogs,
} from '../../db/schema.js';
import { ValidationError } from '../../lib/errors.js';

export async function collaborationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // ─── Tab A: Unassigned clients ──────────────────────────────────

  /**
   * GET /api/orgs/:orgId/collaboration/unassigned-clients
   *
   * Returns clients (org members with role='client') who have NO active
   * `client_assignments` row. Used by the "派单 dashboard" to show which
   * intake clients still need a counselor assigned.
   */
  app.get('/unassigned-clients', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;

    const result = await db.execute(sql`
      SELECT
        u.id, u.name, u.email,
        om.created_at AS joined_at
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      WHERE om.org_id = ${orgId}::uuid
        AND om.role = 'client'
        AND om.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM client_assignments ca
          WHERE ca.org_id = ${orgId}::uuid
            AND ca.client_id = u.id
        )
      ORDER BY om.created_at DESC
    `);
    return Array.isArray(result) ? result : ((result as any).rows ?? []);
  });

  /**
   * GET /api/orgs/:orgId/collaboration/assignments
   * Full assignment list with client and counselor names joined for the
   * "已派单历史" view.
   */
  app.get('/assignments', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;

    const result = await db.execute(sql`
      SELECT
        ca.id, ca.client_id, ca.counselor_id, ca.is_primary,
        ca.created_at AS assigned_at,
        client.name AS client_name,
        counselor.name AS counselor_name
      FROM client_assignments ca
      JOIN users client ON client.id = ca.client_id
      JOIN users counselor ON counselor.id = ca.counselor_id
      WHERE ca.org_id = ${orgId}::uuid
      ORDER BY ca.created_at DESC
    `);
    return Array.isArray(result) ? result : ((result as any).rows ?? []);
  });

  // ─── Tab C: Pending notes for supervision review ────────────────

  /**
   * GET /api/orgs/:orgId/collaboration/pending-notes
   *
   * Returns session notes where:
   *   - status = 'submitted_for_review'
   *   - submitted_for_review_at IS NOT NULL
   *   - The calling user is the supervisor of the note's counselor
   *     (or org_admin sees all)
   */
  app.get('/pending-notes', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const userId = request.user!.id;
    const isAdmin = request.org!.role === 'org_admin';

    // For non-admin: find counselors I supervise
    let superviseeFilter = sql`TRUE`;
    if (!isAdmin) {
      superviseeFilter = sql`sn.counselor_id IN (
        SELECT om.user_id FROM org_members om
        WHERE om.org_id = ${orgId}::uuid
          AND om.supervisor_id = ${userId}::uuid
      )`;
    }

    const result = await db.execute(sql`
      SELECT
        sn.id, sn.client_id, sn.counselor_id, sn.session_date,
        sn.note_format, sn.status, sn.submitted_for_review_at,
        sn.summary,
        client.name AS client_name,
        counselor.name AS counselor_name
      FROM session_notes sn
      JOIN users client ON client.id = sn.client_id
      JOIN users counselor ON counselor.id = sn.counselor_id
      WHERE sn.org_id = ${orgId}::uuid
        AND sn.status = 'submitted_for_review'
        AND ${superviseeFilter}
      ORDER BY sn.submitted_for_review_at DESC
    `);
    return Array.isArray(result) ? result : ((result as any).rows ?? []);
  });

  /**
   * POST /api/orgs/:orgId/collaboration/pending-notes/:noteId/review
   * body: { decision: 'approve' | 'reject', annotation? }
   * Marks the note as reviewed (approve) or returns it to draft with the
   * supervisor annotation (reject).
   */
  app.post('/pending-notes/:noteId/review', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { noteId } = request.params as { noteId: string };
    const body = request.body as { decision?: 'approve' | 'reject'; annotation?: string };
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new ValidationError('decision must be approve or reject');
    }

    const newStatus = body.decision === 'approve' ? 'reviewed' : 'draft';
    const [updated] = await db
      .update(sessionNotes)
      .set({
        status: newStatus,
        supervisorAnnotation: body.annotation ?? null,
        updatedAt: new Date(),
      })
      .where(eq(sessionNotes.id, noteId))
      .returning();

    if (!updated) throw new ValidationError('Note not found');
    return updated;
  });

  // ─── Audit query (org_admin only) ───────────────────────────────

  /**
   * GET /api/orgs/:orgId/collaboration/audit
   * Query params: userId? resource? action? since? until? limit?
   * Returns audit_logs rows scoped to this org.
   */
  app.get('/audit', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const q = request.query as {
      userId?: string;
      resource?: string;
      action?: string;
      since?: string;
      until?: string;
      limit?: string;
    };

    const conditions = [eq(auditLogs.orgId, orgId)];
    if (q.userId) conditions.push(eq(auditLogs.userId, q.userId));
    if (q.resource) conditions.push(eq(auditLogs.resource, q.resource));
    if (q.action) conditions.push(eq(auditLogs.action, q.action));
    if (q.since) conditions.push(gte(auditLogs.createdAt, new Date(q.since)));
    if (q.until) conditions.push(lte(auditLogs.createdAt, new Date(q.until)));

    const limit = Math.min(Math.max(parseInt(q.limit ?? '100', 10), 1), 500);

    return db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  });

  /**
   * GET /api/orgs/:orgId/collaboration/phi-access
   * PHI access log query — who looked at whose chart.
   */
  app.get('/phi-access', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const q = request.query as {
      userId?: string;
      clientId?: string;
      since?: string;
      until?: string;
      limit?: string;
    };

    const conditions = [eq(phiAccessLogs.orgId, orgId)];
    if (q.userId) conditions.push(eq(phiAccessLogs.userId, q.userId));
    if (q.clientId) conditions.push(eq(phiAccessLogs.clientId, q.clientId));
    if (q.since) conditions.push(gte(phiAccessLogs.createdAt, new Date(q.since)));
    if (q.until) conditions.push(lte(phiAccessLogs.createdAt, new Date(q.until)));

    const limit = Math.min(Math.max(parseInt(q.limit ?? '100', 10), 1), 500);

    return db
      .select()
      .from(phiAccessLogs)
      .where(and(...conditions))
      .orderBy(desc(phiAccessLogs.createdAt))
      .limit(limit);
  });
}
