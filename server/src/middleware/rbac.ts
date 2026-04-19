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
    // system_admin always passes role checks
    if (request.user?.isSystemAdmin) return;

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
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // system_admin and org_admin always have all permissions
    if (request.user?.isSystemAdmin) return;
    if (request.org?.role === 'org_admin') return;

    // TODO: load permissions from org_members.permissions once cached
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  };
}

/**
 * Checks that the requesting user can access a specific client's data.
 * Uses the DataScope resolved by dataScopeGuard.
 *
 * @param extractClientId - function to extract the clientId from the request (params, body, or query)
 */
export function requireClientAccess(extractClientId: (req: FastifyRequest) => string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.user?.isSystemAdmin) return;

    const scope = request.dataScope;
    if (!scope) throw new ForbiddenError('Data scope not resolved');

    if (scope.type === 'all') return;

    const clientId = extractClientId(request);
    if (!clientId) return; // no client context, skip

    if (scope.type === 'assigned') {
      if (!scope.allowedClientIds?.includes(clientId)) {
        throw new ForbiddenError('You do not have access to this client');
      }
      return;
    }

    // scope=none → deny access to any specific client data
    throw new ForbiddenError('You do not have access to this client');
  };
}

/**
 * Verifies the requester is either the owner of the resource or an org_admin.
 * Used for write/delete operations.
 *
 * @param extractOwnerId - function to extract the owner's userId from the request
 */
export function requireOwnerOrAdmin(extractOwnerId: (req: FastifyRequest) => string | undefined) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.user?.isSystemAdmin) return;
    if (request.org?.role === 'org_admin') return;

    const ownerId = extractOwnerId(request);
    if (ownerId && ownerId === request.user?.id) return;

    throw new ForbiddenError('Only the owner or an admin can perform this action');
  };
}
