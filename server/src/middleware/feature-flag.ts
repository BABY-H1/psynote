import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasFeature, hasOrgTypeFeature, type Feature, type OrgType, type OrgTypeFeature } from '@psynote/shared';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Feature flag middleware factory.
 *
 * Checks whether the current org's tier includes the requested feature.
 * Also checks orgType-level features (e.g. 'eap' for enterprise orgs).
 *
 * Use after `orgContextGuard` (which populates `request.org.tier` + `request.org.orgType`).
 */
export function requireFeature(feature: Feature | OrgTypeFeature) {
  return async function featureGuard(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.org) {
      throw new ForbiddenError('requireFeature must be used after orgContextGuard');
    }
    // Check tier features + orgType features
    if (!hasFeature(request.org.tier, feature, request.org.orgType)) {
      throw new ForbiddenError(
        `此功能需要更高级别的订阅计划（当前: ${request.org.tier}，需要: ${feature}）`,
      );
    }
  };
}

/**
 * OrgType middleware factory.
 *
 * Checks whether the current org's type matches one of the allowed types.
 * Used for features that are inherent to the org type, not the subscription tier.
 */
export function requireOrgType(...allowedTypes: OrgType[]) {
  return async function orgTypeGuard(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.org) {
      throw new ForbiddenError('requireOrgType must be used after orgContextGuard');
    }
    if (!allowedTypes.includes(request.org.orgType)) {
      throw new ForbiddenError(
        `此功能仅适用于以下组织类型: ${allowedTypes.join(', ')}`,
      );
    }
  };
}
