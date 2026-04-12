/**
 * Admin license management routes.
 *
 * GET  /api/admin/licenses        -- List all orgs with license status
 * POST /api/admin/licenses/issue   -- Issue new license for an org
 * POST /api/admin/licenses/renew   -- Renew existing license
 * POST /api/admin/licenses/revoke  -- Revoke license
 */
import type { FastifyInstance } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, orgMembers } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { verifyLicense } from '../../lib/license/verify.js';
import { signLicense, signLicenseWithExpiry } from '../../lib/license/sign.js';

const VALID_TIERS = ['solo', 'team', 'enterprise', 'platform'] as const;

export async function adminLicenseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  /** List all orgs with their license status */
  app.get('/', async () => {
    // Get all orgs with member counts
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        licenseKey: organizations.licenseKey,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(organizations.createdAt);

    // Get member counts
    const memberCounts = await db
      .select({
        orgId: orgMembers.orgId,
        count: count(),
      })
      .from(orgMembers)
      .where(eq(orgMembers.status, 'active'))
      .groupBy(orgMembers.orgId);

    const countMap = new Map(memberCounts.map((m) => [m.orgId, Number(m.count)]));

    // Verify each org's license
    const result = await Promise.all(
      orgs.map(async (org) => {
        const licenseResult = org.licenseKey
          ? await verifyLicense(org.licenseKey, org.id)
          : { valid: false, status: 'none' as const, payload: null };

        return {
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          plan: org.plan,
          memberCount: countMap.get(org.id) ?? 0,
          license: {
            status: licenseResult.status,
            tier: licenseResult.payload?.tier ?? null,
            maxSeats: licenseResult.payload?.maxSeats ?? null,
            expiresAt: licenseResult.payload?.expiresAt ?? null,
            issuedAt: licenseResult.payload?.issuedAt ?? null,
          },
        };
      }),
    );

    return result;
  });

  /** Issue a new license for an org */
  app.post('/issue', async (request) => {
    const { orgId, tier, maxSeats, months } = request.body as {
      orgId?: string;
      tier?: string;
      maxSeats?: number;
      months?: number;
    };

    if (!orgId) throw new ValidationError('orgId is required');
    if (!tier || !VALID_TIERS.includes(tier as any)) {
      throw new ValidationError(`tier must be one of: ${VALID_TIERS.join(', ')}`);
    }
    if (!maxSeats || maxSeats < 1) throw new ValidationError('maxSeats must be >= 1');
    if (!months || months < 1 || months > 120) throw new ValidationError('months must be 1-120');

    // Verify org exists
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    // Sign the license
    const result = await signLicense({
      orgId,
      tier: tier as any,
      maxSeats,
      months,
    });

    // Persist license key to org
    await db
      .update(organizations)
      .set({ licenseKey: result.token, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    logAudit(request, 'license.issued', 'organization', orgId);

    return {
      success: true,
      ...result,
    };
  });

  /** Renew an existing license (keep tier/seats, extend expiry) */
  app.post('/renew', async (request) => {
    const { orgId, months } = request.body as { orgId?: string; months?: number };

    if (!orgId) throw new ValidationError('orgId is required');
    if (!months || months < 1 || months > 120) throw new ValidationError('months must be 1-120');

    // Get current license
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);
    if (!org.licenseKey) throw new ValidationError('Organization has no active license to renew');

    // Verify current license to get tier and seats
    const current = await verifyLicense(org.licenseKey, orgId);
    if (!current.payload) throw new ValidationError('Current license is invalid, issue a new one instead');

    // Sign new license with same tier/seats but extended expiry
    const result = await signLicense({
      orgId,
      tier: current.payload.tier,
      maxSeats: current.payload.maxSeats,
      months,
    });

    await db
      .update(organizations)
      .set({ licenseKey: result.token, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    logAudit(request, 'license.renewed', 'organization', orgId);

    return { success: true, ...result };
  });

  /** Modify an existing license (change tier/seats, keep expiry) */
  app.post('/modify', async (request) => {
    const { orgId, tier, maxSeats } = request.body as {
      orgId?: string;
      tier?: string;
      maxSeats?: number;
    };

    if (!orgId) throw new ValidationError('orgId is required');

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);
    if (!org.licenseKey) throw new ValidationError('Organization has no active license to modify');

    const current = await verifyLicense(org.licenseKey, orgId);
    if (!current.payload) throw new ValidationError('Current license is invalid, issue a new one instead');

    const newTier = (tier && VALID_TIERS.includes(tier as any)) ? tier as any : current.payload.tier;
    const newSeats = (maxSeats && maxSeats >= 1) ? maxSeats : current.payload.maxSeats;
    const expiresAt = new Date(current.payload.expiresAt);

    const result = await signLicenseWithExpiry({
      orgId,
      tier: newTier,
      maxSeats: newSeats,
      expiresAt,
    });

    // Also sync the plan column
    const planMap: Record<string, string> = { solo: 'free', team: 'pro', enterprise: 'enterprise', platform: 'platform' };
    await db
      .update(organizations)
      .set({ licenseKey: result.token, plan: planMap[newTier] || 'free', updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    logAudit(request, 'license.modified', 'organization', orgId);

    return { success: true, ...result };
  });

  /** Revoke a license */
  app.post('/revoke', async (request) => {
    const { orgId } = request.body as { orgId?: string };

    if (!orgId) throw new ValidationError('orgId is required');

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    await db
      .update(organizations)
      .set({ licenseKey: null, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    logAudit(request, 'license.revoked', 'organization', orgId);

    return { success: true };
  });
}
