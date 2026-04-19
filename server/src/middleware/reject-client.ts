/**
 * Middleware that rejects client (来访者) role from non-portal routes.
 *
 * Clients should ONLY access the system through the client-portal routes.
 * All other org-scoped routes are for staff members (org_admin, counselor) only.
 *
 * Must run AFTER orgContextGuard (which populates request.org.role).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';

export async function rejectClient(request: FastifyRequest, _reply: FastifyReply) {
  if (request.org?.role === 'client') {
    throw new ForbiddenError('来访者请通过客户端门户访问');
  }
}
