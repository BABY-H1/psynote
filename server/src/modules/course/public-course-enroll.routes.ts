import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database.js';
import { courseInstances, courseEnrollments, courses, users } from '../../db/schema.js';

/**
 * Public course enrollment routes -- no authentication required.
 * Used for sharing enrollment links externally.
 * Prefix: /api/public/courses
 */
export async function publicCourseEnrollRoutes(app: FastifyInstance) {

  // GET /api/public/courses/:instanceId -- Get public course info for enrollment page
  app.get('/:instanceId', async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };

    const [instance] = await db
      .select()
      .from(courseInstances)
      .where(eq(courseInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return reply.status(404).send({ error: 'not_found', message: '未找到该课程' });
    }

    // Only show if active and public
    if (instance.status !== 'active') {
      return reply.status(400).send({
        error: 'not_active',
        status: instance.status,
        message: instance.status === 'closed' ? '该课程已结束'
          : instance.status === 'archived' ? '该课程已归档'
          : '该课程暂未开放',
      });
    }

    if (instance.publishMode !== 'public') {
      return reply.status(403).send({
        error: 'not_public',
        message: '该课程不接受公开报名',
      });
    }

    // Get course info
    const [course] = await db
      .select({ title: courses.title, description: courses.description })
      .from(courses)
      .where(eq(courses.id, instance.courseId))
      .limit(1);

    // Count current enrollments
    const enrollments = await db
      .select({ id: courseEnrollments.id, approvalStatus: courseEnrollments.approvalStatus })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.instanceId, instanceId));

    const approvedCount = enrollments.filter((e) => e.approvalStatus === 'approved' || e.approvalStatus === 'auto_approved').length;
    const pendingCount = enrollments.filter((e) => e.approvalStatus === 'pending').length;

    return {
      id: instance.id,
      title: instance.title,
      description: instance.description,
      courseTitle: course?.title,
      courseDescription: course?.description,
      capacity: instance.capacity,
      approvedCount,
      pendingCount,
      spotsLeft: instance.capacity ? Math.max(0, instance.capacity - approvedCount) : null,
    };
  });

  // POST /api/public/courses/:instanceId/apply -- Submit public enrollment application
  app.post('/:instanceId/apply', async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      name: string;
      email: string;
      phone?: string;
    };

    if (!body.name) {
      return reply.status(400).send({ error: '请填写姓名' });
    }
    if (!body.email) {
      return reply.status(400).send({ error: '请填写邮箱' });
    }

    // Check instance exists, is active, and is public
    const [instance] = await db
      .select()
      .from(courseInstances)
      .where(eq(courseInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return reply.status(404).send({ error: '未找到该课程' });
    }

    if (instance.status !== 'active') {
      return reply.status(400).send({ error: '该课程暂未开放报名' });
    }

    if (instance.publishMode !== 'public') {
      return reply.status(403).send({ error: '该课程不接受公开报名' });
    }

    // Find or create user by email
    let [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          name: body.name,
          email: body.email,
          passwordHash: randomUUID(),
        })
        .returning();
    }

    // Check if already enrolled
    const [existing] = await db
      .select()
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.instanceId, instanceId),
        eq(courseEnrollments.userId, user.id),
      ))
      .limit(1);

    if (existing) {
      return reply.status(400).send({
        error: 'already_enrolled',
        message: '您已报名此课程',
        approvalStatus: existing.approvalStatus,
      });
    }

    // Create enrollment
    const [enrollment] = await db
      .insert(courseEnrollments)
      .values({
        courseId: instance.courseId,
        instanceId,
        userId: user.id,
        enrollmentSource: 'public_apply',
        approvalStatus: 'pending',
      })
      .returning();

    return reply.status(201).send({
      success: true,
      enrollmentId: enrollment.id,
      approvalStatus: 'pending',
      message: '报名成功！请等待审核。',
    });
  });
}
