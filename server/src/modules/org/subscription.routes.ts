import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { NotFoundError } from '../../lib/errors.js';
import { planToTier, TIER_FEATURES, TIER_LABELS, type Feature, type OrgTier } from '@psynote/shared';

/**
 * Phase 7c — Subscription info (read-only skeleton).
 *
 * The full "subscriptions / billing" feature is intentionally deferred —
 * psynote has no payment integration yet, and the plan says to keep Phase 7
 * from being over-engineered. What this endpoint DOES ship:
 *
 *   GET /api/orgs/:orgId/subscription
 *
 * Returns the current org's effective tier + feature set + human-readable
 * label, derived from `organizations.plan` via `planToTier`. No new DB table,
 * no writes, no billing webhooks. The payload shape is stable enough that a
 * future Phase 7c.2 (real billing) can enrich it (add `currentPeriodEnd`,
 * `renewsAt`, etc.) without breaking clients.
 *
 * When we DO need a real subscriptions table, this file is the hook point:
 * add a `SELECT * FROM org_subscriptions WHERE org_id = ?` alongside the
 * existing `organizations.plan` read and merge.
 */

export interface SubscriptionInfo {
  tier: OrgTier;
  /** Raw plan value from DB for debugging / admin views */
  plan: string;
  label: string;
  features: Feature[];
}

export async function subscriptionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  app.get('/subscription', async (request): Promise<SubscriptionInfo> => {
    const orgId = request.org!.orgId;
    const [org] = await db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const tier = planToTier(org.plan);
    return {
      tier,
      plan: org.plan,
      label: TIER_LABELS[tier],
      features: Array.from(TIER_FEATURES[tier]),
    };
  });
}
