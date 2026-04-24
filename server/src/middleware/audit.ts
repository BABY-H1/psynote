import type { FastifyRequest } from 'fastify';
import type { DataClass } from '@psynote/shared';
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
 *
 * Migration 026 加了 `dataClass` + `actorRoleSnapshot` 两个字段。新调用
 * 请通过 options 传入,旧签名保持兼容 —— 不传 dataClass 时列留 NULL。
 *
 * dataClass 与 role snapshot 是上线后做 per-class 合规报告的关键字段,
 * 新路由必须传,老路由 Phase 2-4 迁移时陆续接上。
 */
export async function logPhiAccess(
  request: FastifyRequest,
  clientId: string,
  resource: string,
  action: 'view' | 'export' | 'print' | 'share',
  resourceId?: string,
  reason?: string,
  options?: {
    dataClass?: DataClass;
    /** 不传则从 request.org.roleV2 自动冻结快照 */
    actorRoleSnapshot?: string;
  },
) {
  try {
    const actorRoleSnapshot =
      options?.actorRoleSnapshot ?? request.org?.roleV2 ?? request.org?.role;
    await db.insert(phiAccessLogs).values({
      orgId: request.org!.orgId,
      userId: request.user!.id,
      clientId,
      resource,
      resourceId,
      action,
      reason,
      dataClass: options?.dataClass,
      actorRoleSnapshot,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  } catch (err) {
    request.log.error(err, 'Failed to write PHI access log');
  }
}
