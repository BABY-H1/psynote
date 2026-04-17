import type { FastifyInstance } from 'fastify';
import { eq, and, count, sql, gte } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, orgMembers, aiCallLogs } from '../../db/schema.js';
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

  /**
   * AI usage for the current calendar month.
   *
   * Aggregates `ai_call_logs.total_tokens` where created_at >= start of
   * current month. The monthly limit is read from
   * `organizations.settings.aiConfig.monthlyTokenLimit` (0 / missing = unlimited).
   *
   * Note: token tracking is opt-in per pipeline (Phase 11). Pipelines that
   * don't pass a `track` context won't contribute to this count. The UI
   * surfaces a "仅统计已接入追踪的管道" note so users aren't misled.
   */
  app.get('/ai-usage', async (request) => {
    const orgId = request.org!.orgId;
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const aiConfig = ((org.settings as Record<string, any>) || {}).aiConfig || {};
    const monthlyLimit: number = Number(aiConfig.monthlyTokenLimit || 0);

    // First day of current month, 00:00 local time.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [row] = await db
      .select({
        tokens: sql<number>`COALESCE(SUM(${aiCallLogs.totalTokens}), 0)::int`,
        calls: sql<number>`COUNT(*)::int`,
      })
      .from(aiCallLogs)
      .where(and(
        eq(aiCallLogs.orgId, orgId),
        gte(aiCallLogs.createdAt, monthStart),
      ));

    const monthlyUsed = Number(row?.tokens ?? 0);
    const callCount = Number(row?.calls ?? 0);
    const remaining = monthlyLimit > 0 ? Math.max(0, monthlyLimit - monthlyUsed) : null;
    const percentUsed = monthlyLimit > 0 ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : null;

    return {
      monthStart: monthStart.toISOString(),
      monthlyLimit,
      monthlyUsed,
      remaining,
      percentUsed,
      callCount,
      /** True when no limit is configured — show "无限制" in UI */
      unlimited: monthlyLimit <= 0,
    };
  });
}
