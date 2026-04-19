import type { FastifyInstance } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  careEpisodes, careTimeline, assessmentResults, appointments, notifications,
} from '../../db/schema.js';
import { resolveTargetUserId, rejectAsParam } from './client-portal-shared.js';

/**
 * Dashboard + timeline endpoints.
 *
 * `/dashboard` is guardian-readable (active episode + upcoming appointments
 * surfacing in the parent UI) but deliberately blanks out `recentResults`
 * when a guardian is viewing-as — Phase 14 policy: results never leak to
 * guardians.
 *
 * `/timeline` refuses `?as=` entirely.
 */
export async function clientDashboardRoutes(app: FastifyInstance) {
  /** Client dashboard — health overview */
  app.get('/dashboard', async (request) => {
    const callerId = request.user!.id;
    const userId = await resolveTargetUserId(request);
    const orgId = request.org!.orgId;
    const isViewingAs = userId !== callerId;

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

    // Recent results — Phase 14: NEVER expose to a guardian. Blank when viewing-as.
    const recentResults = isViewingAs ? [] : await db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        isNull(assessmentResults.deletedAt),
      ))
      .orderBy(desc(assessmentResults.createdAt))
      .limit(5);

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

    // Guardian sees target's unread count so badges work in the switcher;
    // the notification list itself remains caller-private.
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

  /** Health journey timeline — Phase 14: guardian-blocked */
  app.get('/timeline', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

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
}
