/**
 * Phase 14f — Self-service user routes (the logged-in user editing their own
 * account). Mounted at /api/users.
 *
 *   GET  /me    — full profile: user fields + active org membership fields
 *   PATCH /me   — edit own name + avatarUrl (email is immutable)
 *
 * Org-scoped self edits (bio/specialties/certifications) live on the org
 * members sub-route `PATCH /api/orgs/:orgId/members/me` (see org.routes.ts),
 * because those fields are per-membership, not per-user.
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users, orgMembers, organizations } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  /**
   * Return the caller's own user + a convenience snapshot of their most
   * recently created org_member row (so the frontend can prefill the
   * "咨询师档案" tab in one request).
   */
  app.get('/me', async (request) => {
    const userId = request.user!.id;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        isSystemAdmin: users.isSystemAdmin,
        isGuardianAccount: users.isGuardianAccount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new ValidationError('用户不存在');

    // Most recent org membership (for single-org users this is the only one).
    // The client can also use its own currentOrgId from authStore; we include
    // this for completeness so /me is self-sufficient.
    const [member] = await db
      .select({
        id: orgMembers.id,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        bio: orgMembers.bio,
        specialties: orgMembers.specialties,
        certifications: orgMembers.certifications,
        maxCaseload: orgMembers.maxCaseload,
        orgName: organizations.name,
      })
      .from(orgMembers)
      .leftJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, 'active')))
      .orderBy(desc(orgMembers.createdAt))
      .limit(1);

    return { user, member: member ?? null };
  });

  /**
   * Edit own user-level fields. Explicitly narrow to the two safe fields;
   * email is immutable from the user side (admins can still change via
   * admin-tenant routes), and isSystemAdmin / isGuardianAccount are not
   * self-editable.
   */
  app.patch('/me', async (request) => {
    const body = request.body as { name?: string; avatarUrl?: string | null };
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) throw new ValidationError('姓名不能为空');
      updates.name = trimmed;
    }
    if (body.avatarUrl !== undefined) {
      updates.avatarUrl = body.avatarUrl || null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('没有可更新的字段');
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, request.user!.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        isSystemAdmin: users.isSystemAdmin,
      });

    return updated;
  });
}
