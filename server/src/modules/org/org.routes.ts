import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, orgMembers, users } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';

export async function orgRoutes(app: FastifyInstance) {
  // All org routes require authentication
  app.addHook('preHandler', authGuard);

  /** List organizations the current user belongs to */
  app.get('/', async (request) => {
    const userId = request.user!.id;

    const memberships = await db
      .select({
        org: organizations,
        role: orgMembers.role,
        status: orgMembers.status,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId));

    return memberships.map((m) => ({
      ...m.org,
      myRole: m.role,
      myStatus: m.status,
    }));
  });

  /** Create a new organization */
  app.post('/', async (request, reply) => {
    const { name, slug } = request.body as { name: string; slug: string };
    const userId = request.user!.id;

    if (!name || !slug) {
      throw new ValidationError('name and slug are required');
    }

    // Check slug uniqueness
    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (existing) {
      throw new ValidationError(`Organization slug '${slug}' is already taken`);
    }

    // Create org with default triage config
    const [org] = await db.insert(organizations).values({
      name,
      slug,
      triageConfig: DEFAULT_TRIAGE_CONFIG,
    }).returning();

    // Add creator as org_admin
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId,
      role: 'org_admin',
      status: 'active',
    });

    await logAudit(request, 'create', 'organizations', org.id);

    return reply.status(201).send(org);
  });

  /** Get organization details (requires membership) */
  app.get('/:orgId', { preHandler: [orgContextGuard] }, async (request) => {
    const { orgId } = request.params as { orgId: string };

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundError('Organization', orgId);

    return org;
  });

  /** Update organization (org_admin only) */
  app.patch('/:orgId', {
    preHandler: [orgContextGuard, requireRole('org_admin')],
  }, async (request) => {
    const { orgId } = request.params as { orgId: string };
    const updates = request.body as Partial<{ name: string; settings: unknown }>;

    const [org] = await db
      .update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning();

    await logAudit(request, 'update', 'organizations', orgId);

    return org;
  });

  /** List members of organization */
  app.get('/:orgId/members', {
    preHandler: [orgContextGuard],
  }, async (request) => {
    const { orgId } = request.params as { orgId: string };

    const members = await db
      .select({
        member: orgMembers,
        user: users,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId));

    return members.map((m) => ({
      id: m.member.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.member.role,
      status: m.member.status,
      permissions: m.member.permissions,
      validUntil: m.member.validUntil,
      createdAt: m.member.createdAt,
    }));
  });

  /** Invite a member to organization (org_admin only) */
  app.post('/:orgId/members/invite', {
    preHandler: [orgContextGuard, requireRole('org_admin')],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { email, role, name } = request.body as {
      email: string;
      role: string;
      name?: string;
    };

    if (!email || !role) {
      throw new ValidationError('email and role are required');
    }

    // Find or create user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // User doesn't exist yet - create a placeholder
      [user] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email,
        name: name || email.split('@')[0],
      }).returning();
    }

    // Check if already a member
    const [existingMember] = await db
      .select()
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.userId, user.id),
      ))
      .limit(1);

    if (existingMember) {
      throw new ValidationError('User is already a member of this organization');
    }

    const [member] = await db.insert(orgMembers).values({
      orgId,
      userId: user.id,
      role,
      status: 'pending',
    }).returning();

    await logAudit(request, 'create', 'org_members', member.id);

    return reply.status(201).send({
      id: member.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
      status: member.status,
    });
  });

  /** Update a member (role, status) */
  app.patch('/:orgId/members/:memberId', {
    preHandler: [orgContextGuard, requireRole('org_admin')],
  }, async (request) => {
    const { memberId } = request.params as { memberId: string };
    const body = request.body as { role?: string; status?: string; permissions?: Record<string, unknown> };

    const updates: Record<string, unknown> = {};
    if (body.role) updates.role = body.role;
    if (body.status) updates.status = body.status;
    if (body.permissions) updates.permissions = body.permissions;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No fields to update');
    }

    const [updated] = await db
      .update(orgMembers)
      .set(updates)
      .where(eq(orgMembers.id, memberId))
      .returning();

    if (!updated) throw new ValidationError('Member not found');

    await logAudit(request, 'update', 'org_members', memberId);
    return updated;
  });

  /** Remove a member */
  app.delete('/:orgId/members/:memberId', {
    preHandler: [orgContextGuard, requireRole('org_admin')],
  }, async (request) => {
    const { memberId } = request.params as { memberId: string };

    // Don't allow removing yourself
    const [member] = await db.select().from(orgMembers).where(eq(orgMembers.id, memberId)).limit(1);
    if (!member) throw new ValidationError('Member not found');
    if (member.userId === request.user!.id) throw new ValidationError('Cannot remove yourself');

    await db.delete(orgMembers).where(eq(orgMembers.id, memberId));
    await logAudit(request, 'delete', 'org_members', memberId);
    return { success: true };
  });

  /** Get triage configuration */
  app.get('/:orgId/triage-config', {
    preHandler: [orgContextGuard],
  }, async (request) => {
    const { orgId } = request.params as { orgId: string };

    const [org] = await db
      .select({ triageConfig: organizations.triageConfig })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundError('Organization', orgId);

    return org.triageConfig;
  });

  /** Update triage configuration (org_admin only) */
  app.put('/:orgId/triage-config', {
    preHandler: [orgContextGuard, requireRole('org_admin')],
  }, async (request) => {
    const { orgId } = request.params as { orgId: string };
    const triageConfig = request.body;

    // TODO: validate with triageConfigSchema from @psynote/shared

    const [org] = await db
      .update(organizations)
      .set({ triageConfig, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning();

    await logAudit(request, 'update', 'organizations', orgId, {
      triageConfig: { old: null, new: triageConfig },
    });

    return org.triageConfig;
  });
}
