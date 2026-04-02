import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';
import type { OrgRole } from '@psynote/shared';

/**
 * Creates a Fastify preHandler that checks whether the request user
 * has one of the allowed roles in the current organization.
 *
 * Usage:
 *   { preHandler: [authGuard, orgContextGuard, requireRole('org_admin', 'counselor')] }
 */
export function requireRole(...allowedRoles: OrgRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const role = request.org?.role;
    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenError(
        `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
      );
    }
  };
}

/**
 * Check a specific permission flag from org_members.permissions.
 *
 * Usage:
 *   { preHandler: [authGuard, orgContextGuard, requirePermission('canConsult')] }
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // org_admin always has all permissions
    if (request.org?.role === 'org_admin') return;

    // TODO: load permissions from org_members once cached
    // For now this is a placeholder - in production, permissions
    // would be loaded in orgContextGuard and attached to request.org
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  };
}
