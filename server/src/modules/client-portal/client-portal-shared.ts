import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../lib/errors.js';
import * as parentBindingService from '../parent-binding/parent-binding.service.js';

/**
 * Phase 14 — `?as=<userId>` guardian impersonation.
 *
 * If `?as=` is present and differs from the caller's own id, verify that
 * the caller has an **active** parent-binding relationship with the
 * target. Returns the target id so the handler operates on the child's
 * data instead of the caller's.
 *
 * Opt-in: call this helper from the small set of whitelisted routes
 *   /dashboard, /appointments, /counselors,
 *   /documents, /documents/:id, /documents/:id/sign,
 *   /consents, /consents/:id/revoke.
 *
 * Routes that should refuse `?as=` outright (results, timeline, group /
 * course memberships, referrals, appointment-requests) call
 * `rejectAsParam` below instead.
 */
export async function resolveTargetUserId(request: FastifyRequest): Promise<string> {
  const callerId = request.user!.id;
  const orgId = request.org!.orgId;
  const asParam = (request.query as any)?.as as string | undefined;
  if (!asParam || asParam === callerId) return callerId;

  const ok = await parentBindingService.hasActiveRelationship({
    orgId,
    holderUserId: callerId,
    relatedClientUserId: asParam,
  });
  if (!ok) throw new ForbiddenError('No active relationship with this user');
  return asParam;
}

/**
 * Refuse a `?as=` query param for routes that must always serve the
 * caller's own data (never a child's). Throws 403 if the caller tries.
 */
export function rejectAsParam(request: FastifyRequest): void {
  const asParam = (request.query as any)?.as as string | undefined;
  const callerId = request.user!.id;
  if (asParam && asParam !== callerId) {
    throw new ForbiddenError('该数据不可代查');
  }
}
