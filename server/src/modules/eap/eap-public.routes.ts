/**
 * EAP Public routes — Employee self-registration (no auth required)
 *
 * Mounted at /api/public/eap
 *
 * GET    /:orgSlug/info      — Get enterprise org info (name, logo, departments)
 * POST   /:orgSlug/register  — Employee self-registration
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  organizations,
  orgMembers,
  users,
  eapEmployeeProfiles,
} from '../../db/schema.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { hasFeature, planToTier } from '@psynote/shared';
import { verifyLicense } from '../../lib/license/verify.js';

async function resolveOrgTier(org: { plan: string; licenseKey: string | null; id: string }) {
  if (org.licenseKey) {
    const result = await verifyLicense(org.licenseKey, org.id);
    if (result.valid && result.payload) return result.payload.tier;
  }
  return planToTier(org.plan);
}

export async function eapPublicRoutes(app: FastifyInstance) {
  // No auth hooks — these are public endpoints

  // ─── Get Enterprise Org Info ─────────────────────────────────────
  app.get('/:orgSlug/info', async (request) => {
    const { orgSlug } = request.params as { orgSlug: string };

    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        licenseKey: organizations.licenseKey,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    // Verify this is an enterprise org
    const tier = await resolveOrgTier(org);
    if (!hasFeature(tier, 'eap')) {
      throw new NotFoundError('Organization not found');
    }

    const settings = (org.settings || {}) as Record<string, any>;
    const eapConfig = settings.eapConfig || {};
    const branding = settings.branding || {};

    return {
      name: org.name,
      slug: org.slug,
      logoUrl: branding.logoUrl || null,
      themeColor: branding.themeColor || null,
      departments: (eapConfig.departments || []).map((d: any) => ({
        id: d.id,
        name: d.name,
      })),
    };
  });

  // ─── Employee Self-Registration ──────────────────────────────────
  app.post('/:orgSlug/register', async (request, reply) => {
    const { orgSlug } = request.params as { orgSlug: string };
    const body = request.body as {
      name: string;
      email: string;
      password: string;
      employeeId?: string;
      department?: string;
    };

    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      throw new ValidationError('姓名、邮箱和密码不能为空');
    }
    if (body.password.length < 6) {
      throw new ValidationError('密码至少 6 位');
    }

    // Find enterprise org
    const [org] = await db
      .select({
        id: organizations.id,
        plan: organizations.plan,
        licenseKey: organizations.licenseKey,
      })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const tier = await resolveOrgTier(org);
    if (!hasFeature(tier, 'eap')) {
      throw new NotFoundError('Organization not found');
    }

    const email = body.email.trim().toLowerCase();

    // Check if user exists
    let [existingUser] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // W0.4 安全审计修复 (2026-05-03): same takeover-prevention pattern as
      // counseling-public.routes.ts. EAP variant didn't issue tokens, but it
      // still attached an arbitrary user row to the attacker's org as a
      // `client` member without any proof of ownership.
      if (existingUser.passwordHash) {
        const valid = await bcrypt.compare(body.password, existingUser.passwordHash);
        if (!valid) {
          throw new UnauthorizedError('邮箱或密码错误');
        }
      } else {
        const newHash = await bcrypt.hash(body.password, 10);
        await db
          .update(users)
          .set({ passwordHash: newHash, name: body.name.trim() })
          .where(eq(users.id, existingUser.id));
      }
      userId = existingUser.id;
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(body.password, 10);
      const [newUser] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email,
        name: body.name.trim(),
        passwordHash,
      }).returning();
      userId = newUser.id;
      isNewUser = true;
    }

    // Check if already a member
    const [existingMember] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, org.id),
        eq(orgMembers.userId, userId),
      ))
      .limit(1);

    if (existingMember) {
      // Already registered, just return success
      return { status: 'already_registered', orgId: org.id };
    }

    // Add as client member
    await db.insert(orgMembers).values({
      id: crypto.randomUUID(),
      orgId: org.id,
      userId,
      role: 'client',
      status: 'active',
    });

    // Create employee profile
    await db.insert(eapEmployeeProfiles).values({
      orgId: org.id,
      userId,
      employeeId: body.employeeId || null,
      department: body.department || null,
      entryMethod: 'link',
      isAnonymous: false,
    });

    reply.code(201);
    return { status: 'registered', orgId: org.id, isNewUser };
  });
}
