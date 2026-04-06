import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { db } from '../../config/database.js';
import { organizations, orgMembers, users } from '../../db/schema.js';
import { eq, count, sql } from 'drizzle-orm';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  // List all organizations
  app.get('/orgs', async (request) => {
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

  // Get org detail with stats
  app.get('/orgs/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new Error('Organization not found');

    const members = await db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId));
    return { ...org, members };
  });

  // Update org (plan, settings)
  app.patch('/orgs/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const updates = request.body as { plan?: string; settings?: Record<string, unknown> };
    const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, orgId)).returning();
    return updated;
  });

  // Platform stats
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
}
