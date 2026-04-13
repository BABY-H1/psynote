import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull, or, gt } from 'drizzle-orm';
import { db } from '../config/database.js';
import { clientAssignments, clientAccessGrants } from '../db/schema.js';

export interface DataScope {
  /** 'all' = unrestricted, 'assigned' = only listed clients, 'basic_only' = admin_staff (names/schedule), 'aggregate_only' = HR/enterprise admin (only eap_usage_events aggregates), 'none' = client portal self-only */
  type: 'all' | 'assigned' | 'basic_only' | 'aggregate_only' | 'none';
  /** Populated for 'assigned' type — union of own clients, granted clients, and supervisees' clients */
  allowedClientIds?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    dataScope?: DataScope;
  }
}

/**
 * Resolves data scope based on role, assignments, grants, and supervisor relationships.
 * Must run after authGuard and orgContextGuard.
 */
export async function dataScopeGuard(request: FastifyRequest, _reply: FastifyReply) {
  const org = request.org;
  if (!org) return; // orgContextGuard didn't run or no org

  const userId = request.user!.id;

  // hr_admin → aggregate-only (can only see eap_usage_events aggregates, no clinical data)
  if (org.role === 'hr_admin') {
    request.dataScope = { type: 'aggregate_only' };
    return;
  }

  // Enterprise org's org_admin: aggregate-only (same as hr_admin — no clinical data)
  // Detection: org has 'eap' feature → it's an enterprise org
  const { hasFeature } = await import('@psynote/shared');
  const isEnterpriseOrg = hasFeature(org.tier, 'eap');

  if (org.role === 'org_admin' && isEnterpriseOrg) {
    request.dataScope = { type: 'aggregate_only' };
    return;
  }

  // system_admin, org_admin (non-enterprise), or counselor with full practice access → see everything
  if (
    request.user?.isSystemAdmin
    || org.role === 'org_admin'
    || (org.role === 'counselor' && org.fullPracticeAccess)
  ) {
    request.dataScope = { type: 'all' };
    return;
  }

  // Normal counselor → union of own assignments + grants + supervisees' assignments
  if (org.role === 'counselor') {
    const now = new Date();

    // 1. Own assigned clients
    const ownAssignments = await db
      .select({ clientId: clientAssignments.clientId })
      .from(clientAssignments)
      .where(and(
        eq(clientAssignments.orgId, org.orgId),
        eq(clientAssignments.counselorId, userId),
      ));

    // 2. Temporarily granted clients
    const grants = await db
      .select({ clientId: clientAccessGrants.clientId })
      .from(clientAccessGrants)
      .where(and(
        eq(clientAccessGrants.orgId, org.orgId),
        eq(clientAccessGrants.grantedToCounselorId, userId),
        isNull(clientAccessGrants.revokedAt),
        or(
          isNull(clientAccessGrants.expiresAt),
          gt(clientAccessGrants.expiresAt, now),
        ),
      ));

    // 3. Supervisees' clients
    let superviseeClients: { clientId: string }[] = [];
    if (org.superviseeUserIds.length > 0) {
      // Get all client assignments for supervisee counselors
      const { inArray } = await import('drizzle-orm');
      superviseeClients = await db
        .select({ clientId: clientAssignments.clientId })
        .from(clientAssignments)
        .where(and(
          eq(clientAssignments.orgId, org.orgId),
          inArray(clientAssignments.counselorId, org.superviseeUserIds),
        ));
    }

    // Union and deduplicate
    const allClientIds = new Set([
      ...ownAssignments.map((a) => a.clientId),
      ...grants.map((g) => g.clientId),
      ...superviseeClients.map((s) => s.clientId),
    ]);

    request.dataScope = {
      type: 'assigned',
      allowedClientIds: [...allClientIds],
    };
    return;
  }

  // admin_staff → basic info only (names, schedule)
  if (org.role === 'admin_staff') {
    request.dataScope = { type: 'basic_only' };
    return;
  }

  // client → self-only (portal routes handle their own filtering)
  request.dataScope = { type: 'none' };
}
