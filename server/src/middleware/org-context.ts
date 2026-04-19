import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { queryClient } from '../config/database.js';
import { orgMembers, organizations } from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { OrgRole, OrgTier, OrgType, LicenseInfo } from '@psynote/shared';
import { planToTier } from '@psynote/shared';
import { verifyLicense } from '../lib/license/verify.js';

export interface OrgContext {
  orgId: string;
  role: OrgRole;
  memberId: string;
  supervisorId: string | null;
  fullPracticeAccess: boolean;
  superviseeUserIds: string[];
  /** Mapped from organizations.plan at the start of each request */
  tier: OrgTier;
  /** Organization type from settings.orgType — determines UI and scene-specific capabilities */
  orgType: OrgType;
  /** License verification result — used for seat limits & expiry display */
  license: LicenseInfo;
}

/** No license present — use DB plan as fallback */
const NO_LICENSE: LicenseInfo = { status: 'none', maxSeats: null, expiresAt: null };

/**
 * Resolve effective tier from license key (if present) or fall back to DB plan.
 * License takes precedence when valid; on expiry we degrade to solo.
 */
async function resolveTier(
  orgId: string,
  licenseKey: string | null | undefined,
  dbPlan: string | null | undefined,
): Promise<{ tier: OrgTier; license: LicenseInfo }> {
  if (!licenseKey) {
    return { tier: planToTier(dbPlan), license: NO_LICENSE };
  }

  const result = await verifyLicense(licenseKey, orgId);

  if (result.valid && result.payload) {
    return {
      tier: result.payload.tier,
      license: {
        status: 'active',
        maxSeats: result.payload.maxSeats,
        expiresAt: result.payload.expiresAt,
      },
    };
  }

  if (result.status === 'expired' && result.payload) {
    // Expired license → degrade to the most restrictive tier (starter) so the
    // org loses premium features, but still expose expiry info in the payload
    // so the UI can prompt renewal.
    return {
      tier: 'starter',
      license: {
        status: 'expired',
        maxSeats: result.payload.maxSeats,
        expiresAt: result.payload.expiresAt,
      },
    };
  }

  // Invalid signature / malformed → fall back to DB plan
  return {
    tier: planToTier(dbPlan),
    license: { status: 'invalid', maxSeats: null, expiresAt: null },
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    org?: OrgContext;
  }
}

/**
 * Middleware that resolves the org from :orgId param,
 * verifies user membership, and sets PostgreSQL session vars for RLS.
 */
export async function orgContextGuard(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId?: string };
  if (!orgId) {
    throw new NotFoundError('Organization ID is required');
  }

  const userId = request.user?.id;
  if (!userId) {
    throw new ForbiddenError('Authentication required before org context');
  }

  // System admin bypass: full access to any org without membership.
  // Still load the org row so we know its tier (system admins see the real tier).
  if (request.user?.isSystemAdmin) {
    const [orgRow] = await db
      .select({ plan: organizations.plan, licenseKey: organizations.licenseKey, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const { tier, license } = await resolveTier(orgId, orgRow?.licenseKey, orgRow?.plan);
    const orgSettings = (orgRow?.settings || {}) as Record<string, any>;
    request.org = {
      orgId,
      role: 'org_admin',
      memberId: 'system-admin',
      supervisorId: null,
      fullPracticeAccess: true,
      superviseeUserIds: [],
      tier,
      orgType: (orgSettings.orgType || 'counseling') as OrgType,
      license,
    };
    await queryClient`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    await queryClient`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return;
  }

  // Look up membership
  const [member] = await db
    .select()
    .from(orgMembers)
    .where(and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.userId, userId),
      eq(orgMembers.status, 'active'),
    ))
    .limit(1);

  if (!member) {
    throw new ForbiddenError('You are not a member of this organization');
  }

  // Check validity period
  if (member.validUntil && new Date(member.validUntil) < new Date()) {
    throw new ForbiddenError('Your membership has expired');
  }

  // Load supervisee user IDs (people this member supervises).
  // Note: enterprise org_admin is aggregate-only so doesn't need supervisees;
  // the role gate below naturally excludes enterprise admins from loading them.
  let superviseeUserIds: string[] = [];
  if (member.role === 'counselor' || member.role === 'org_admin') {
    const supervisees = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.supervisorId, member.id),
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.status, 'active'),
      ));
    superviseeUserIds = supervisees.map((s) => s.userId);
  }

  // Load the org's plan + license key + settings → resolve effective tier + orgType.
  const [orgRow] = await db
    .select({ plan: organizations.plan, licenseKey: organizations.licenseKey, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const { tier, license } = await resolveTier(orgId, orgRow?.licenseKey, orgRow?.plan);
  const memberOrgSettings = (orgRow?.settings || {}) as Record<string, any>;

  request.org = {
    orgId,
    role: member.role as OrgRole,
    memberId: member.id,
    supervisorId: member.supervisorId ?? null,
    fullPracticeAccess: member.fullPracticeAccess ?? (member.role === 'org_admin'),
    superviseeUserIds,
    tier,
    orgType: (memberOrgSettings.orgType || 'counseling') as OrgType,
    license,
  };

  // Set PostgreSQL session variables for RLS
  await queryClient`SELECT set_config('app.current_org_id', ${orgId}, true)`;
  await queryClient`SELECT set_config('app.current_user_id', ${userId}, true)`;
}
