import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { courseEnrollments, courseInstances, users, courses } from '../../db/schema.js';
import { rejectClient } from '../../middleware/reject-client.js';

/**
 * Authenticated enrollment management routes for course instances.
 * Prefix: /api/orgs/:orgId/course-instances
 */
export async function courseEnrollmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  // ─── List Enrollments ────────────────────────────────────────────

  app.get('/:instanceId/enrollments', async (request) => {
    const { instanceId } = request.params as { instanceId: string };

    const rows = await db
      .select({
        id: courseEnrollments.id,
        courseId: courseEnrollments.courseId,
        instanceId: courseEnrollments.instanceId,
        userId: courseEnrollments.userId,
        careEpisodeId: courseEnrollments.careEpisodeId,
        assignedBy: courseEnrollments.assignedBy,
        enrollmentSource: courseEnrollments.enrollmentSource,
        approvalStatus: courseEnrollments.approvalStatus,
        approvedBy: courseEnrollments.approvedBy,
        progress: courseEnrollments.progress,
        status: courseEnrollments.status,
        enrolledAt: courseEnrollments.enrolledAt,
        completedAt: courseEnrollments.completedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(courseEnrollments)
      .leftJoin(users, eq(users.id, courseEnrollments.userId))
      .where(eq(courseEnrollments.instanceId, instanceId));

    return rows;
  });

  // ─── Assign to Specific Users ────────────────────────────────────

  app.post('/:instanceId/assign', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as { userIds: string[]; careEpisodeId?: string };

    if (!body.userIds?.length) {
      return reply.status(400).send({ error: 'userIds array is required' });
    }

    // Fetch the instance to get courseId
    const [instance] = await db
      .select()
      .from(courseInstances)
      .where(eq(courseInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }

    const results = [];
    for (const userId of body.userIds) {
      // Skip if already enrolled for this course+user
      const [existing] = await db
        .select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(and(
          eq(courseEnrollments.instanceId, instanceId),
          eq(courseEnrollments.userId, userId),
        ))
        .limit(1);

      if (existing) {
        results.push({ userId, skipped: true, enrollmentId: existing.id });
        continue;
      }

      const [enrollment] = await db
        .insert(courseEnrollments)
        .values({
          courseId: instance.courseId,
          instanceId,
          userId,
          assignedBy: request.user!.id,
          careEpisodeId: body.careEpisodeId,
          enrollmentSource: 'assigned',
          approvalStatus: 'auto_approved',
        })
        .returning();

      results.push({ userId, skipped: false, enrollmentId: enrollment.id });
      await logAudit(request, 'create', 'course_enrollments', enrollment.id);
    }

    return reply.status(201).send({ results });
  });

  // ─── Batch Enroll ────────────────────────────────────────────────

  app.post('/:instanceId/batch-enroll', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as { userIds: string[]; groupLabel?: string };

    if (!body.userIds?.length) {
      return reply.status(400).send({ error: 'userIds array is required' });
    }

    // Fetch the instance to get courseId
    const [instance] = await db
      .select()
      .from(courseInstances)
      .where(eq(courseInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }

    const results = [];
    for (const userId of body.userIds) {
      const [existing] = await db
        .select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(and(
          eq(courseEnrollments.instanceId, instanceId),
          eq(courseEnrollments.userId, userId),
        ))
        .limit(1);

      if (existing) {
        results.push({ userId, skipped: true, enrollmentId: existing.id });
        continue;
      }

      const [enrollment] = await db
        .insert(courseEnrollments)
        .values({
          courseId: instance.courseId,
          instanceId,
          userId,
          assignedBy: request.user!.id,
          enrollmentSource: 'class_batch',
          approvalStatus: 'auto_approved',
        })
        .returning();

      results.push({ userId, skipped: false, enrollmentId: enrollment.id });
      await logAudit(request, 'create', 'course_enrollments', enrollment.id);
    }

    return reply.status(201).send({ results, groupLabel: body.groupLabel });
  });

  // ─── Update Approval Status ──────────────────────────────────────

  app.patch('/:instanceId/enrollments/:enrollmentId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { instanceId, enrollmentId } = request.params as {
      instanceId: string;
      enrollmentId: string;
    };
    const body = request.body as { approvalStatus: 'approved' | 'rejected' };

    if (!['approved', 'rejected'].includes(body.approvalStatus)) {
      throw new Error('approvalStatus must be "approved" or "rejected"');
    }

    const [updated] = await db
      .update(courseEnrollments)
      .set({
        approvalStatus: body.approvalStatus,
        approvedBy: request.user!.id,
      })
      .where(and(
        eq(courseEnrollments.id, enrollmentId),
        eq(courseEnrollments.instanceId, instanceId),
      ))
      .returning();

    if (!updated) {
      throw new Error('Enrollment not found');
    }

    await logAudit(request, 'update', 'course_enrollments', enrollmentId);
    return updated;
  });
}
