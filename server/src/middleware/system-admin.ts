import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Guard that requires system_admin privilege.
 * Used for platform-level admin routes (/api/admin/*).
 */
export async function requireSystemAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user?.isSystemAdmin) {
    throw new ForbiddenError('System administrator access required');
  }
}
