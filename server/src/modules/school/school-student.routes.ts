/**
 * School student management routes — 学生管理
 *
 * Mounted at /api/orgs/:orgId/school/students
 * Guard: requireOrgType('school')
 *
 * GET    /              — List students (filterable by grade/class)
 * GET    /stats          — Student statistics
 * POST   /import         — Bulk import students from CSV/JSON
 * PATCH  /:id            — Update student profile
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { schoolStudentProfiles, orgMembers, users } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError } from '../../lib/errors.js';

export async function schoolStudentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('school'));

  // ─── List Students ───────────────────────────────────────────────
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;
    const query = request.query as { grade?: string; className?: string; search?: string };

    const students = await db
      .select({
        id: schoolStudentProfiles.id,
        userId: schoolStudentProfiles.userId,
        studentId: schoolStudentProfiles.studentId,
        grade: schoolStudentProfiles.grade,
        className: schoolStudentProfiles.className,
        parentName: schoolStudentProfiles.parentName,
        parentPhone: schoolStudentProfiles.parentPhone,
        createdAt: schoolStudentProfiles.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(schoolStudentProfiles)
      .leftJoin(users, eq(users.id, schoolStudentProfiles.userId))
      .where(eq(schoolStudentProfiles.orgId, orgId))
      .orderBy(schoolStudentProfiles.grade, schoolStudentProfiles.className);

    let filtered = students;
    if (query.grade) filtered = filtered.filter((s) => s.grade === query.grade);
    if (query.className) filtered = filtered.filter((s) => s.className === query.className);
    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter((s) =>
        s.userName?.toLowerCase().includes(q) ||
        s.studentId?.toLowerCase().includes(q) ||
        s.parentName?.toLowerCase().includes(q),
      );
    }

    return { students: filtered };
  });

  // ─── Student Stats ───────────────────────────────────────────────
  app.get('/stats', async (request) => {
    const orgId = request.org!.orgId;

    const [{ total }] = await db
      .select({ total: count() })
      .from(schoolStudentProfiles)
      .where(eq(schoolStudentProfiles.orgId, orgId));

    const gradeStats = await db
      .select({ grade: schoolStudentProfiles.grade, count: count() })
      .from(schoolStudentProfiles)
      .where(eq(schoolStudentProfiles.orgId, orgId))
      .groupBy(schoolStudentProfiles.grade);

    return {
      total: Number(total),
      grades: gradeStats.map((g) => ({ name: g.grade || '未分配', count: Number(g.count) })),
    };
  });

  // ─── Bulk Import Students ────────────────────────────────────────
  app.post('/import', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      students: Array<{
        name: string;
        studentId?: string;
        grade?: string;
        className?: string;
        parentName?: string;
        parentPhone?: string;
        parentEmail?: string;
      }>;
    };

    if (!body.students?.length) {
      throw new ValidationError('students array is required');
    }
    if (body.students.length > 500) {
      throw new ValidationError('Maximum 500 students per import');
    }

    const defaultPassword = 'psynote123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const results: { name: string; status: 'created' | 'existing' | 'error'; error?: string }[] = [];

    for (const stu of body.students) {
      try {
        if (!stu.name?.trim()) {
          results.push({ name: '', status: 'error', error: '姓名不能为空' });
          continue;
        }

        // Generate email from studentId or name (students may not have email)
        const email = stu.studentId
          ? `${stu.studentId}@student.internal`
          : `${crypto.randomUUID().slice(0, 8)}@student.internal`;

        // Check if user exists (by studentId-based email)
        let [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        let userId: string;
        if (existingUser) {
          userId = existingUser.id;
        } else {
          const [newUser] = await db.insert(users).values({
            id: crypto.randomUUID(),
            email,
            name: stu.name.trim(),
            passwordHash,
          }).returning();
          userId = newUser.id;
        }

        // Add as client member if not already
        const [existingMember] = await db
          .select({ id: orgMembers.id })
          .from(orgMembers)
          .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
          .limit(1);

        if (!existingMember) {
          await db.insert(orgMembers).values({
            id: crypto.randomUUID(),
            orgId,
            userId,
            role: 'client',
            status: 'active',
          });
        }

        // Create or update student profile
        const [existingProfile] = await db
          .select({ id: schoolStudentProfiles.id })
          .from(schoolStudentProfiles)
          .where(and(eq(schoolStudentProfiles.orgId, orgId), eq(schoolStudentProfiles.userId, userId)))
          .limit(1);

        if (existingProfile) {
          results.push({ name: stu.name, status: 'existing' });
        } else {
          await db.insert(schoolStudentProfiles).values({
            orgId,
            userId,
            studentId: stu.studentId || null,
            grade: stu.grade || null,
            className: stu.className || null,
            parentName: stu.parentName || null,
            parentPhone: stu.parentPhone || null,
            parentEmail: stu.parentEmail || null,
            entryMethod: 'import',
          });
          results.push({ name: stu.name, status: 'created' });
        }
      } catch (err: any) {
        results.push({ name: stu.name || '', status: 'error', error: err.message });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    const existing = results.filter((r) => r.status === 'existing').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return { summary: { total: results.length, created, existing, errors }, results };
  });

  // ─── Update Student Profile ──────────────────────────────────────
  app.patch('/:studentProfileId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { studentProfileId } = request.params as { studentProfileId: string };
    const body = request.body as Partial<{
      studentId: string;
      grade: string;
      className: string;
      parentName: string;
      parentPhone: string;
      parentEmail: string;
    }>;

    const updates: Record<string, unknown> = {};
    if (body.studentId !== undefined) updates.studentId = body.studentId;
    if (body.grade !== undefined) updates.grade = body.grade;
    if (body.className !== undefined) updates.className = body.className;
    if (body.parentName !== undefined) updates.parentName = body.parentName;
    if (body.parentPhone !== undefined) updates.parentPhone = body.parentPhone;
    if (body.parentEmail !== undefined) updates.parentEmail = body.parentEmail;

    const [updated] = await db
      .update(schoolStudentProfiles)
      .set(updates)
      .where(and(
        eq(schoolStudentProfiles.id, studentProfileId),
        eq(schoolStudentProfiles.orgId, orgId),
      ))
      .returning();

    return { student: updated };
  });
}
