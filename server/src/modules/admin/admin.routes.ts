import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { db } from '../../config/database.js';
import { organizations, orgMembers, users } from '../../db/schema.js';
import { eq, count, ilike, or, desc } from 'drizzle-orm';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  // ─── Platform Stats ─────────────────────────────────────────────
  app.get('/stats', async () => {
    const [orgCount] = await db.select({ count: count() }).from(organizations);
    const [userCount] = await db.select({ count: count() }).from(users);
    const [memberCount] = await db.select({ count: count() }).from(orgMembers);
    return {
      organizations: orgCount.count,
      users: userCount.count,
      memberships: memberCount.count,
    };
  });

  // ─── Organization Management ────────────────────────────────────

  app.get('/orgs', async () => {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        createdAt: organizations.createdAt,
        memberCount: count(orgMembers.id),
      })
      .from(organizations)
      .leftJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(organizations.createdAt);
    return orgs;
  });

  app.get('/orgs/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new Error('Organization not found');

    const members = await db
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        status: orgMembers.status,
        fullPracticeAccess: orgMembers.fullPracticeAccess,
        supervisorId: orgMembers.supervisorId,
        createdAt: orgMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId));

    return { ...org, members };
  });

  app.patch('/orgs/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const updates = request.body as { plan?: string; settings?: Record<string, unknown> };
    const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, orgId)).returning();
    return updated;
  });

  // ─── User Management ────────────────────────────────────────────

  /** List all users with search and org membership info */
  app.get('/users', async (request) => {
    const { search } = request.query as { search?: string };

    let query = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isSystemAdmin: users.isSystemAdmin,
        createdAt: users.createdAt,
        orgCount: count(orgMembers.id),
      })
      .from(users)
      .leftJoin(orgMembers, eq(orgMembers.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
        ),
      );
    }

    return query;
  });

  /** Get user detail with all org memberships */
  app.get('/users/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error('User not found');

    const memberships = await db
      .select({
        id: orgMembers.id,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        status: orgMembers.status,
        fullPracticeAccess: orgMembers.fullPracticeAccess,
        supervisorId: orgMembers.supervisorId,
        createdAt: orgMembers.createdAt,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgPlan: organizations.plan,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSystemAdmin: user.isSystemAdmin,
      createdAt: user.createdAt,
      memberships,
    };
  });

  /** Create a new user */
  app.post('/users', async (request, reply) => {
    const { email, name, password, isSystemAdmin: isSA } = request.body as {
      email: string;
      name: string;
      password: string;
      isSystemAdmin?: boolean;
    };
    if (!email || !name || !password) throw new Error('email, name, and password are required');

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) throw new Error('该邮箱已存在');

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({
      email,
      name,
      passwordHash,
      isSystemAdmin: isSA ?? false,
    }).returning();

    return reply.status(201).send({
      id: user.id,
      email: user.email,
      name: user.name,
      isSystemAdmin: user.isSystemAdmin,
      createdAt: user.createdAt,
    });
  });

  /** Update user (toggle system admin, change name) */
  app.patch('/users/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    const body = request.body as { name?: string; isSystemAdmin?: boolean };
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.isSystemAdmin !== undefined) updates.isSystemAdmin = body.isSystemAdmin;

    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      isSystemAdmin: updated.isSystemAdmin,
      createdAt: updated.createdAt,
    };
  });

  /** Reset user password */
  app.post('/users/:userId/reset-password', async (request) => {
    const { userId } = request.params as { userId: string };
    const { password } = request.body as { password: string };
    if (!password || password.length < 6) throw new Error('密码至少6位');

    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    return { ok: true };
  });

  /** Disable/enable user (set all memberships to disabled/active) */
  app.post('/users/:userId/toggle-status', async (request) => {
    const { userId } = request.params as { userId: string };
    const { disabled } = request.body as { disabled: boolean };

    const newStatus = disabled ? 'disabled' : 'active';
    await db.update(orgMembers).set({ status: newStatus }).where(eq(orgMembers.userId, userId));
    return { ok: true, status: newStatus };
  });

  // ─── System Config ──────────────────────────────────────────────

  /** Get system config (stored in a simple key-value approach via env/db) */
  app.get('/config', async () => {
    // Return current runtime configuration
    const { env } = await import('../../config/env.js');
    return {
      platform: {
        name: 'Psynote',
        version: '1.0.0',
      },
      security: {
        accessTokenExpiry: '7d',
        refreshTokenExpiry: '30d',
        minPasswordLength: 6,
      },
      defaults: {
        orgPlan: 'free',
        maxMembersPerOrg: 100,
      },
      email: {
        configured: !!(env as any).SMTP_HOST,
        host: (env as any).SMTP_HOST || '未配置',
      },
      ai: {
        configured: !!env.AI_API_KEY,
        model: env.AI_MODEL || '未配置',
        baseUrl: env.AI_BASE_URL || '未配置',
      },
    };
  });
}
