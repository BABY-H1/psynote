import type { FastifyInstance } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { db } from '../../config/database.js';
import {
  careEpisodes, careTimeline, assessmentResults, appointments,
  groupInstances, groupEnrollments, courses, courseEnrollments,
  notifications,
} from '../../db/schema.js';

export async function clientPortalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Client dashboard - health overview */
  app.get('/dashboard', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    // Active care episode
    const [episode] = await db
      .select()
      .from(careEpisodes)
      .where(and(
        eq(careEpisodes.orgId, orgId),
        eq(careEpisodes.clientId, userId),
        eq(careEpisodes.status, 'active'),
      ))
      .orderBy(desc(careEpisodes.updatedAt))
      .limit(1);

    // Recent results
    const recentResults = await db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        isNull(assessmentResults.deletedAt),
      ))
      .orderBy(desc(assessmentResults.createdAt))
      .limit(5);

    // Upcoming appointments
    const upcomingAppts = await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, orgId),
        eq(appointments.clientId, userId),
        eq(appointments.status, 'confirmed'),
      ))
      .orderBy(appointments.startTime)
      .limit(3);

    // Unread notifications count
    const unreadNotifs = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.orgId, orgId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ));

    return {
      episode: episode || null,
      recentResults,
      upcomingAppointments: upcomingAppts,
      unreadNotificationCount: unreadNotifs.length,
    };
  });

  /** My assessment results */
  app.get('/results', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        isNull(assessmentResults.deletedAt),
      ))
      .orderBy(desc(assessmentResults.createdAt));
  });

  /** My appointments */
  app.get('/appointments', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, orgId),
        eq(appointments.clientId, userId),
      ))
      .orderBy(desc(appointments.startTime));
  });

  /** My health timeline */
  app.get('/timeline', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    // Find my care episodes
    const episodes = await db
      .select({ id: careEpisodes.id })
      .from(careEpisodes)
      .where(and(
        eq(careEpisodes.orgId, orgId),
        eq(careEpisodes.clientId, userId),
      ));

    if (episodes.length === 0) return [];

    const episodeIds = episodes.map((e) => e.id);
    return db
      .select()
      .from(careTimeline)
      .where(or(...episodeIds.map((id) => eq(careTimeline.careEpisodeId, id))))
      .orderBy(desc(careTimeline.createdAt))
      .limit(50);
  });

  /** Available groups to join */
  app.get('/groups', async (request) => {
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(groupInstances)
      .where(and(
        eq(groupInstances.orgId, orgId),
        eq(groupInstances.status, 'recruiting'),
      ))
      .orderBy(desc(groupInstances.createdAt));
  });

  /** Available courses (published only) */
  app.get('/courses', async (request) => {
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

  /** My group enrollments */
  app.get('/my-groups', async (request) => {
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
}
