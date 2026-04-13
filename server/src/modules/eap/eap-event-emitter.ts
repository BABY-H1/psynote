/**
 * EAP Usage Event emitter — 事件采集工具函数
 *
 * Called from various business modules to record usage events
 * for enterprise orgs. Events are only recorded when the org
 * has the 'eap' feature (enterprise tier).
 *
 * This module ONLY writes to eap_usage_events. It never reads
 * clinical data — maintaining the physical privacy boundary.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { eapUsageEvents, eapEmployeeProfiles, organizations } from '../../db/schema.js';
import { hasFeature, planToTier, type OrgTier } from '@psynote/shared';
import { verifyLicense } from '../../lib/license/verify.js';

interface EmitEventParams {
  orgId: string;
  eventType: string;
  userId?: string;
  riskLevel?: string;
  metadata?: Record<string, unknown>;
}

// Cache org tier checks to avoid repeated license verification
const tierCache = new Map<string, { tier: OrgTier; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isEnterpriseOrg(orgId: string): Promise<boolean> {
  // Check cache
  const cached = tierCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return hasFeature(cached.tier, 'eap');
  }

  try {
    const [org] = await db
      .select({ plan: organizations.plan, licenseKey: organizations.licenseKey })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) return false;

    let tier: OrgTier;
    if (org.licenseKey) {
      const result = await verifyLicense(org.licenseKey, orgId);
      tier = result.valid && result.payload ? result.payload.tier : planToTier(org.plan);
    } else {
      tier = planToTier(org.plan);
    }

    tierCache.set(orgId, { tier, expiresAt: Date.now() + CACHE_TTL });
    return hasFeature(tier, 'eap');
  } catch {
    return false;
  }
}

/**
 * Record a usage event for an enterprise org.
 * No-op if the org is not an enterprise org.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export async function emitEapEvent(params: EmitEventParams): Promise<void> {
  try {
    const isEnterprise = await isEnterpriseOrg(params.orgId);
    if (!isEnterprise) return;

    // Look up employee's department (if userId provided)
    let department: string | null = null;
    if (params.userId) {
      const [profile] = await db
        .select({ department: eapEmployeeProfiles.department })
        .from(eapEmployeeProfiles)
        .where(and(
          eq(eapEmployeeProfiles.orgId, params.orgId),
          eq(eapEmployeeProfiles.userId, params.userId),
        ))
        .limit(1);
      department = profile?.department || null;
    }

    await db.insert(eapUsageEvents).values({
      enterpriseOrgId: params.orgId,
      eventType: params.eventType,
      userId: params.userId || null,
      department,
      riskLevel: params.riskLevel || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.warn('[eap-event] Failed to emit event:', err);
  }
}
