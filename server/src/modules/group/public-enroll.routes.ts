import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  groupInstances, groupSchemes, groupSchemeSessions, groupEnrollments,
  groupSessionRecords, groupSessionAttendance, users, orgMembers,
} from '../../db/schema.js';

/**
 * Public group enrollment routes — no authentication required.
 * Used for sharing recruitment links externally.
 */
export async function publicEnrollRoutes(app: FastifyInstance) {
  // GET /api/public/groups/:instanceId — Get public group info for enrollment page
  app.get('/:instanceId', async (request) => {
    const { instanceId } = request.params as { instanceId: string };

    const [instance] = await db
      .select()
      .from(groupInstances)
      .where(eq(groupInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return { error: 'not_found', message: '未找到该团辅活动' };
    }

    // Only show if recruiting
    if (instance.status !== 'recruiting') {
      return {
        error: 'not_recruiting',
        status: instance.status,
        message: instance.status === 'ended' ? '该活动已结束'
          : instance.status === 'ongoing' ? '该活动已开始，暂不接受新报名'
          : '该活动暂未开放报名',
      };
    }

    // Get scheme info if linked
    let schemeInfo = null;
    let sessionCount = 0;
    if (instance.schemeId) {
      const [scheme] = await db
        .select()
        .from(groupSchemes)
        .where(eq(groupSchemes.id, instance.schemeId))
        .limit(1);

      if (scheme) {
        const sessions = await db
          .select({ id: groupSchemeSessions.id })
          .from(groupSchemeSessions)
          .where(eq(groupSchemeSessions.schemeId, scheme.id));

        sessionCount = sessions.length;

        schemeInfo = {
          title: scheme.title,
          description: scheme.description,
          theory: scheme.theory,
          overallGoal: scheme.overallGoal,
          targetAudience: scheme.targetAudience,
          ageRange: scheme.ageRange,
          recommendedSize: scheme.recommendedSize,
          totalSessions: scheme.totalSessions,
          sessionDuration: scheme.sessionDuration,
          frequency: scheme.frequency,
          sessionCount,
        };
      }
    }

    // Count current enrollments
    const enrollments = await db
      .select({ id: groupEnrollments.id, status: groupEnrollments.status })
      .from(groupEnrollments)
      .where(eq(groupEnrollments.instanceId, instanceId));

    const approvedCount = enrollments.filter((e) => e.status === 'approved').length;
    const pendingCount = enrollments.filter((e) => e.status === 'pending').length;

    return {
      id: instance.id,
      title: instance.title,
      description: instance.description,
      location: instance.location,
      startDate: instance.startDate,
      schedule: instance.schedule,
      duration: instance.duration,
      capacity: instance.capacity,
      approvedCount,
      pendingCount,
      spotsLeft: instance.capacity ? Math.max(0, instance.capacity - approvedCount) : null,
      recruitmentAssessments: instance.recruitmentAssessments || [],
      scheme: schemeInfo,
    };
  });

  // POST /api/public/groups/:instanceId/apply — Submit enrollment application
  app.post('/:instanceId/apply', async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = request.body as {
      name: string;
      email?: string;
      phone?: string;
      // Assessment responses will be handled separately via the assessment runner
    };

    if (!body.name) {
      return reply.status(400).send({ error: '请填写姓名' });
    }

    // Check instance exists and is recruiting
    const [instance] = await db
      .select()
      .from(groupInstances)
      .where(eq(groupInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return reply.status(404).send({ error: '未找到该团辅活动' });
    }

    if (instance.status !== 'recruiting') {
      return reply.status(400).send({ error: '该活动暂未开放报名' });
    }

    // Check capacity
    if (instance.capacity) {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(groupEnrollments)
        .where(and(
          eq(groupEnrollments.instanceId, instanceId),
          eq(groupEnrollments.status, 'approved'),
        ));
      if (Number(countResult?.count || 0) >= instance.capacity) {
        return reply.status(400).send({ error: '报名已满，暂无空位' });
      }
    }

    // Find or create a user record for this applicant
    // For public enrollment, we create a minimal user in the org
    let userId: string;
    if (body.email) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            id: randomUUID(),
            email: body.email,
            name: body.name,
          })
          .returning();
        userId = newUser.id;
      }
    } else {
      // No email — create user with just name
      const [newUser] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          name: body.name,
        })
        .returning();
      userId = newUser.id;
    }

    // 补建 org_members(role='client') —— 此前 bug: 只建 users 不建 org_members,
    // 导致公开报名产生孤儿用户无法登录看到自己数据。alpha 修复:
    // 若用户已是本 org 任意 role 成员,跳过;否则建 client role 行。
    const [existingMember] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, instance.orgId),
        eq(orgMembers.userId, userId),
      ))
      .limit(1);

    if (!existingMember) {
      await db.insert(orgMembers).values({
        orgId: instance.orgId,
        userId,
        role: 'client',
        status: 'active',
      });
    }

    // Check if already enrolled
    const [existing] = await db
      .select()
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.userId, userId),
      ))
      .limit(1);

    if (existing) {
      return reply.status(400).send({
        error: 'already_enrolled',
        message: '您已报名此活动',
        status: existing.status,
      });
    }

    // Create enrollment
    const [enrollment] = await db
      .insert(groupEnrollments)
      .values({
        instanceId,
        userId,
        status: 'pending',
      })
      .returning();

    return reply.status(201).send({
      success: true,
      enrollmentId: enrollment.id,
      status: 'pending',
      message: '报名成功！请等待审核。',
    });
  });

  // GET /api/public/groups/:instanceId/checkin/:sessionId — Get check-in page info
  app.get('/:instanceId/checkin/:sessionId', async (request) => {
    const { instanceId, sessionId } = request.params as { instanceId: string; sessionId: string };

    const [instance] = await db
      .select()
      .from(groupInstances)
      .where(eq(groupInstances.id, instanceId))
      .limit(1);

    if (!instance) return { error: 'not_found', message: '未找到该活动' };

    const [session] = await db
      .select()
      .from(groupSessionRecords)
      .where(and(
        eq(groupSessionRecords.id, sessionId),
        eq(groupSessionRecords.instanceId, instanceId),
      ))
      .limit(1);

    if (!session) return { error: 'not_found', message: '未找到该活动场次' };

    // Get approved enrollments with user info
    const enrollments = await db
      .select({ enrollment: groupEnrollments, userName: users.name, userEmail: users.email })
      .from(groupEnrollments)
      .leftJoin(users, eq(users.id, groupEnrollments.userId))
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.status, 'approved'),
      ));

    // Get existing attendance for this session
    const attendance = await db
      .select()
      .from(groupSessionAttendance)
      .where(eq(groupSessionAttendance.sessionRecordId, sessionId));

    const attendanceMap = new Map(attendance.map((a) => [a.enrollmentId, a.status]));

    return {
      instanceTitle: instance.title,
      sessionTitle: session.title,
      sessionNumber: session.sessionNumber,
      sessionDate: session.date,
      sessionStatus: session.status,
      members: enrollments.map((e) => ({
        enrollmentId: e.enrollment.id,
        name: e.userName || '未知',
        checkedIn: attendanceMap.get(e.enrollment.id) || null,
      })),
    };
  });

  // POST /api/public/groups/:instanceId/checkin/:sessionId — Self check-in
  app.post('/:instanceId/checkin/:sessionId', async (request, reply) => {
    const { instanceId, sessionId } = request.params as { instanceId: string; sessionId: string };
    const { enrollmentId } = request.body as { enrollmentId: string };

    if (!enrollmentId) return reply.status(400).send({ error: '缺少成员信息' });

    // Verify the session exists
    const [session] = await db
      .select()
      .from(groupSessionRecords)
      .where(and(
        eq(groupSessionRecords.id, sessionId),
        eq(groupSessionRecords.instanceId, instanceId),
      ))
      .limit(1);

    if (!session) return reply.status(404).send({ error: '未找到该活动场次' });

    // W2.8 (security audit 2026-05-03): verify enrollment belongs to THIS
    // instance. Without this check, an attacker can POST any enrollmentId
    // (e.g. from another group) and we'd write attendance for an arbitrary
    // user under this group's session — arbitrary check-in forgery.
    const [enrollmentInInstance] = await db
      .select({ id: groupEnrollments.id })
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.id, enrollmentId),
        eq(groupEnrollments.instanceId, instanceId),
      ))
      .limit(1);

    if (!enrollmentInInstance) {
      return reply.status(404).send({ error: '该报名记录不属于此活动' });
    }

    // Check if already checked in
    const [existing] = await db
      .select()
      .from(groupSessionAttendance)
      .where(and(
        eq(groupSessionAttendance.sessionRecordId, sessionId),
        eq(groupSessionAttendance.enrollmentId, enrollmentId),
      ))
      .limit(1);

    if (existing) {
      return { success: true, message: '您已签到', status: existing.status };
    }

    // Create attendance record
    const [record] = await db
      .insert(groupSessionAttendance)
      .values({
        sessionRecordId: sessionId,
        enrollmentId,
        status: 'present',
      })
      .returning();

    return { success: true, message: '签到成功！', status: record.status };
  });
}
