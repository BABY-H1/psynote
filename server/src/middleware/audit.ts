import type { FastifyRequest } from 'fastify';
import { db } from '../config/database.js';
import { auditLogs, phiAccessLogs } from '../db/schema.js';

/**
 * Log an action to the audit trail.
 */
export async function logAudit(
  request: FastifyRequest,
  action: string,
  resource: string,
  resourceId?: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
) {
  try {
    await db.insert(auditLogs).values({
      orgId: request.org?.orgId,
      userId: request.user?.id,
      action,
      resource,
      resourceId,
      changes,
      ipAddress: request.ip,
    });
  } catch (err) {
    // Audit logging should not break the request
    request.log.error(err, 'Failed to write audit log');
  }
}

/**
 * Log access to Protected Health Information (HIPAA requirement).
 */
export async function logPhiAccess(
  request: FastifyRequest,
  clientId: string,
  resource: string,
  action: 'view' | 'export' | 'print' | 'share',
  resourceId?: string,
  reason?: string,
) {
  try {
    await db.insert(phiAccessLogs).values({
      orgId: request.org!.orgId,
      userId: request.user!.id,
      clientId,
      resource,
      resourceId,
      action,
      reason,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  } catch (err) {
    request.log.error(err, 'Failed to write PHI access log');
  }
}
