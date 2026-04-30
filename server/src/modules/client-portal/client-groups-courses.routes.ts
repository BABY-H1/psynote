import type { FastifyInstance } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  groupInstances, groupEnrollments, groupSchemes, groupSchemeSessions,
  groupSessionRecords, groupSessionAttendance,
  courses, courseEnrollments, courseChapters, courseContentBlocks,
} from '../../db/schema.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { rejectAsParam } from './client-portal-shared.js';

/**
 * Groups + courses discovery and participation.
 *
 * All endpoints in this module are Phase-14 guardian-blocked (a guardian
 * cannot act-as to enroll in groups or sign for their child).
 *
 * `/my-assessments` — the complex per-user assessment aggregator across
 * both group and course enrollments — lives in its own module
 * (`client-my-assessments.routes.ts`) to keep this file focused on
 * instance discovery + attendance.
 */
export async function clientGroupsCoursesRoutes(app: FastifyInstance) {
  /** Available groups to join */
  app.get('/groups', async (request) => {
    rejectAsParam(request);
    const orgId = request.org!.orgId;
    const userId = request.user!.id;

    const instances = await db
      .select()
      .from(groupInstances)
      .where(and(
        eq(groupInstances.orgId, orgId),
        eq(groupInstances.status, 'recruiting'),
      ))
      .orderBy(desc(groupInstances.createdAt));
    if (instances.length === 0) return [];

    const allEnrollments = await db
      .select()
      .from(groupEnrollments)
      .where(or(...instances.map((i) => eq(groupEnrollments.instanceId, i.id))));

    const schemeIds = [...new Set(instances.map((i) => i.schemeId).filter(Boolean))] as string[];
    const schemeMap = new Map<string, any>();
    if (schemeIds.length > 0) {
      const schemes = await db
        .select({
          id: groupSchemes.id,
          title: groupSchemes.title,
          overallGoal: groupSchemes.overallGoal,
          targetAudience: groupSchemes.targetAudience,
          totalSessions: groupSchemes.totalSessions,
          sessionDuration: groupSchemes.sessionDuration,
          frequency: groupSchemes.frequency,
          theory: groupSchemes.theory,
        })
        .from(groupSchemes)
        .where(or(...schemeIds.map((id) => eq(groupSchemes.id, id))));
      for (const s of schemes) schemeMap.set(s.id, s);
    }

    return instances.map((inst) => {
      const instEnrollments = allEnrollments.filter((e) => e.instanceId === inst.id);
      const approvedCount = instEnrollments.filter((e) => e.status === 'approved').length;
      const myEnrollment = instEnrollments.find((e) => e.userId === userId);
      const scheme = inst.schemeId ? schemeMap.get(inst.schemeId) : null;

      return {
        ...inst,
        approvedCount,
        spotsLeft: inst.capacity ? Math.max(0, inst.capacity - approvedCount) : null,
        myEnrollmentStatus: myEnrollment?.status || null,
        scheme: scheme ? {
          title: scheme.title,
          overallGoal: scheme.overallGoal,
          targetAudience: scheme.targetAudience,
          totalSessions: scheme.totalSessions,
          sessionDuration: scheme.sessionDuration,
          frequency: scheme.frequency,
          theory: scheme.theory,
        } : null,
      };
    });
  });

  /** Available courses (published only) */
  app.get('/courses', async (request) => {
    rejectAsParam(request);
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(courses)
      .where(
        and(
          eq(courses.status, 'published'),
          or(
            eq(courses.orgId, orgId),
            and(isNull(courses.orgId), eq(courses.isPublic, true)),
          ),
        ),
      )
      .orderBy(desc(courses.createdAt));
  });

  /** My course enrollments */
  app.get('/my-courses', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;

    return db
      .select({
        enrollment: courseEnrollments,
        courseTitle: courses.title,
        courseCategory: courses.category,
      })
      .from(courseEnrollments)
      .leftJoin(courses, eq(courses.id, courseEnrollments.courseId))
      .where(eq(courseEnrollments.userId, userId))
      .orderBy(desc(courseEnrollments.enrolledAt));
  });

  /**
   * Course detail for an enrolled participant.
   *
   * Bug fix (BUG-012): the org-admin route at /api/orgs/:orgId/courses/:courseId
   * is gated by `rejectClient`, so portal CourseReader cannot fetch course
   * detail directly. This endpoint returns the same envelope shape (course +
   * chapters + per-chapter content blocks filtered to participant-visible
   * blocks) for an enrolled client.
   *
   * Auth: client must have an active enrollment for this course in this org.
   */
  app.get('/courses/:courseId', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { courseId } = request.params as { courseId: string };

    // Verify enrollment
    const [enrollment] = await db
      .select()
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.userId, userId),
        eq(courseEnrollments.courseId, courseId),
      ))
      .limit(1);
    if (!enrollment) throw new ValidationError('You are not enrolled in this course');

    // Course
    const [course] = await db
      .select()
      .from(courses)
      .where(and(
        eq(courses.id, courseId),
        or(eq(courses.orgId, orgId), and(isNull(courses.orgId), eq(courses.isPublic, true))),
      ))
      .limit(1);
    if (!course) throw new ValidationError('Course not found');

    // Chapters (sorted)
    const chapters = await db
      .select()
      .from(courseChapters)
      .where(eq(courseChapters.courseId, courseId))
      .orderBy(courseChapters.sortOrder);

    // Content blocks for all chapters in one query, filtered to participant-visible
    const chapterIds = chapters.map((c) => c.id);
    const blocks = chapterIds.length === 0 ? [] : await db
      .select()
      .from(courseContentBlocks)
      .where(and(
        // chapterId IN (...): drizzle's inArray would be cleaner; use OR chain for compat
        or(...chapterIds.map((id) => eq(courseContentBlocks.chapterId, id))),
      ))
      .orderBy(courseContentBlocks.sortOrder);
    const visibleBlocks = blocks.filter((b) => b.visibility === 'participant' || b.visibility === 'both');

    return {
      enrollment,
      course,
      chapters: chapters.map((c) => ({
        ...c,
        contentBlocks: visibleBlocks.filter((b) => b.chapterId === c.id),
      })),
    };
  });

  /** My group enrollments */
  app.get('/my-groups', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;

    return db
      .select({
        enrollment: groupEnrollments,
        instanceTitle: groupInstances.title,
        instanceStatus: groupInstances.status,
      })
      .from(groupEnrollments)
      .leftJoin(groupInstances, eq(groupInstances.id, groupEnrollments.instanceId))
      .where(eq(groupEnrollments.userId, userId))
      .orderBy(desc(groupEnrollments.createdAt));
  });

  /**
   * Phase 9γ — Group instance detail for the participant.
   * Returns instance + scheme + session records in one envelope so the
   * portal can render a session list decorated with my-attendance status.
   * Verifies enrollment before returning.
   */
  app.get('/groups/:instanceId', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { instanceId } = request.params as { instanceId: string };

    const [enrollment] = await db
      .select()
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.userId, userId),
      ))
      .limit(1);
    if (!enrollment) throw new ValidationError('You are not enrolled in this group');

    const [instance] = await db
      .select()
      .from(groupInstances)
      .where(and(
        eq(groupInstances.id, instanceId),
        eq(groupInstances.orgId, orgId),
      ))
      .limit(1);
    if (!instance) throw new ValidationError('Group instance not found');

    let scheme = null;
    let schemeSessions: any[] = [];
    if (instance.schemeId) {
      const [s] = await db
        .select()
        .from(groupSchemes)
        .where(eq(groupSchemes.id, instance.schemeId))
        .limit(1);
      scheme = s ?? null;

      schemeSessions = await db
        .select()
        .from(groupSchemeSessions)
        .where(eq(groupSchemeSessions.schemeId, instance.schemeId));
    }

    const records = await db
      .select()
      .from(groupSessionRecords)
      .where(eq(groupSessionRecords.instanceId, instanceId))
      .orderBy(groupSessionRecords.sessionNumber);

    const attendance = records.length > 0
      ? await db
        .select()
        .from(groupSessionAttendance)
        .where(eq(groupSessionAttendance.enrollmentId, enrollment.id))
      : [];
    const attendanceMap = new Map(attendance.map((a) => [a.sessionRecordId, a]));

    return {
      enrollment,
      instance,
      scheme,
      schemeSessions,
      sessionRecords: records.map((r) => ({
        ...r,
        myAttendance: attendanceMap.get(r.id) ?? null,
      })),
    };
  });

  /** Phase 9γ — Participant self check-in for a session record */
  app.post('/groups/:instanceId/sessions/:sessionRecordId/check-in', async (request, reply) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const { instanceId, sessionRecordId } = request.params as {
      instanceId: string;
      sessionRecordId: string;
    };

    const [enrollment] = await db
      .select()
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.userId, userId),
      ))
      .limit(1);
    if (!enrollment) throw new ValidationError('Not enrolled in this group');

    const [sessionRecord] = await db
      .select()
      .from(groupSessionRecords)
      .where(and(
        eq(groupSessionRecords.id, sessionRecordId),
        eq(groupSessionRecords.instanceId, instanceId),
      ))
      .limit(1);
    if (!sessionRecord) throw new ValidationError('Session record not found');

    const [existing] = await db
      .select()
      .from(groupSessionAttendance)
      .where(and(
        eq(groupSessionAttendance.sessionRecordId, sessionRecordId),
        eq(groupSessionAttendance.enrollmentId, enrollment.id),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(groupSessionAttendance)
        .set({ status: 'present' })
        .where(eq(groupSessionAttendance.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(groupSessionAttendance)
      .values({
        sessionRecordId,
        enrollmentId: enrollment.id,
        status: 'present',
      })
      .returning();
    await logAudit(request, 'create', 'group_session_attendance', created.id);
    return reply.status(201).send(created);
  });
}
