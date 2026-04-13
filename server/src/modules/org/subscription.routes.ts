import type { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, orgMembers } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { rejectClient } from '../../middleware/reject-client.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  planToTier,
  TIER_FEATURES,
  TIER_LABELS,
  type Feature,
  type OrgTier,
  type LicenseInfo,
} from '@psynote/shared';

/**
 * Phase 7c — Subscription + license info (read-only).
 *
 * GET /api/orgs/:orgId/subscription
 *   Returns tier, features, and license status including seat usage.
 *   The `license` block is populated from `request.org.license` which is
 *   resolved by `orgContextGuard` via RSA-signed license key verification.
 */

export interface SubscriptionInfo {
  tier: OrgTier;
  /** Raw plan value from DB for debugging / admin views */
  plan: string;
  label: string;
  features: Feature[];
  license: LicenseInfo & { seatsUsed: number };
}

export async function subscriptionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  app.get('/subscription', async (request): Promise<SubscriptionInfo> => {
    const orgId = request.org!.orgId;
    const [org] = await db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    // Count active seats
    const [seatResult] = await db
      .select({ value: count() })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.status, 'active'),
      ));

    const tier = request.org!.tier;
    const license = request.org!.license;

    return {
      tier,
      plan: org.plan,
      label: TIER_LABELS[tier],
      features: Array.from(TIER_FEATURES[tier]),
      license: {
        ...license,
        seatsUsed: seatResult.value,
      },
    };
  });
}
