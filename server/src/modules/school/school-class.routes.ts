/**
 * School class management routes — 班级管理
 *
 * Mounted at /api/orgs/:orgId/school/classes
 * Guard: requireOrgType('school')
 *
 * GET    /              — List all classes grouped by grade
 * POST   /              — Create a class
 * PATCH  /:classId      — Update a class
 * DELETE /:classId      — Delete a class
 */
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { schoolClasses, users } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

export async function schoolClassRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('school'));

  // ─── List Classes ────────────────────────────────────────────────
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;

    const classes = await db
      .select({
        id: schoolClasses.id,
        grade: schoolClasses.grade,
        className: schoolClasses.className,
        homeroomTeacherId: schoolClasses.homeroomTeacherId,
        studentCount: schoolClasses.studentCount,
        createdAt: schoolClasses.createdAt,
        teacherName: users.name,
      })
      .from(schoolClasses)
      .leftJoin(users, eq(users.id, schoolClasses.homeroomTeacherId))
      .where(eq(schoolClasses.orgId, orgId))
      .orderBy(schoolClasses.grade, schoolClasses.className);

    // Group by grade
    const grouped: Record<string, typeof classes> = {};
    for (const cls of classes) {
      const grade = cls.grade;
      if (!grouped[grade]) grouped[grade] = [];
      grouped[grade].push(cls);
    }

    return { classes, grouped };
  });

  // ─── Create Class ───────────────────────────────────────────────
  app.post('/', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      grade: string;
      className: string;
      homeroomTeacherId?: string;
    };

    if (!body.grade?.trim() || !body.className?.trim()) {
      throw new ValidationError('年级和班级名称不能为空');
    }

    const [cls] = await db
      .insert(schoolClasses)
      .values({
        orgId,
        grade: body.grade.trim(),
        className: body.className.trim(),
        homeroomTeacherId: body.homeroomTeacherId || null,
      })
      .returning();

    reply.code(201);
    return { class: cls };
  });

  // ─── Update Class ───────────────────────────────────────────────
  app.patch('/:classId', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { classId } = request.params as { classId: string };
    const body = request.body as Partial<{
      grade: string;
      className: string;
      homeroomTeacherId: string | null;
    }>;

    const [existing] = await db
      .select()
      .from(schoolClasses)
      .where(and(eq(schoolClasses.id, classId), eq(schoolClasses.orgId, orgId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Class not found');

    const updates: Record<string, unknown> = {};
    if (body.grade) updates.grade = body.grade.trim();
    if (body.className) updates.className = body.className.trim();
    if (body.homeroomTeacherId !== undefined) updates.homeroomTeacherId = body.homeroomTeacherId;

    const [updated] = await db
      .update(schoolClasses)
      .set(updates)
      .where(eq(schoolClasses.id, classId))
      .returning();

    return { class: updated };
  });

  // ─── Delete Class ───────────────────────────────────────────────
  app.delete('/:classId', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;
    const { classId } = request.params as { classId: string };

    const [existing] = await db
      .select()
      .from(schoolClasses)
      .where(and(eq(schoolClasses.id, classId), eq(schoolClasses.orgId, orgId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Class not found');

    await db.delete(schoolClasses).where(eq(schoolClasses.id, classId));
    reply.code(204);
  });
}
