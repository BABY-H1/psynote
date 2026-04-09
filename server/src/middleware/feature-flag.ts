import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasFeature, type Feature } from '@psynote/shared';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Phase 7a — Feature flag middleware factory.
 *
 * Use after `orgContextGuard` (which populates `request.org.tier`). Throws
 * `ForbiddenError` if the current org's tier does not include the requested
 * feature.
 *
 * Typical usage:
 * ```ts
 * app.addHook('preHandler', authGuard);
 * app.addHook('preHandler', orgContextGuard);
 * app.patch('/branding', {
 *   preHandler: [requireFeature('branding'), requireRole('org_admin')],
 * }, async (req) => { ... });
 * ```
 *
 * Note: this is a factory. `requireFeature('branding')` returns a Fastify
 * preHandler, not the middleware itself.
 */
export function requireFeature(feature: Feature) {
  return async function featureGuard(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.org) {
      throw new ForbiddenError(
        'requireFeature must be used after orgContextGuard',
      );
    }
    if (!hasFeature(request.org.tier, feature)) {
      throw new ForbiddenError(
        `此功能需要更高级别的订阅计划（当前: ${request.org.tier}，需要: ${feature}）`,
      );
    }
  };
}
