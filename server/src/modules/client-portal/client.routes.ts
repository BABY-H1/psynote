import type { FastifyInstance } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { db } from '../../config/database.js';
import {
  careEpisodes, careTimeline, assessmentResults, appointments,
  groupInstances, groupEnrollments, courses, courseEnrollments,
  notifications, orgMembers, users,
} from '../../db/schema.js';
import * as appointmentService from '../counseling/appointment.service.js';
import * as consentService from '../compliance/consent.service.js';

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

  /** List counselors in this org (for appointment booking) */
  app.get('/counselors', async (request) => {
    const orgId = request.org!.orgId;

    return db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, 'counselor'),
        eq(orgMembers.status, 'active'),
      ));
  });

  /** Submit an appointment request (client-initiated) */
  app.post('/appointment-requests', async (request, reply) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const body = request.body as {
      counselorId: string;
      startTime: string;
      endTime: string;
      type?: string;
      notes?: string;
    };

    if (!body.counselorId) throw new ValidationError('counselorId is required');
    if (!body.startTime || !body.endTime) throw new ValidationError('startTime and endTime are required');

    const appointment = await appointmentService.createClientRequest({
      orgId,
      clientId: userId,
      counselorId: body.counselorId,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      type: body.type,
      notes: body.notes,
    });

    await logAudit(request, 'create', 'appointments', appointment.id);
    return reply.status(201).send(appointment);
  });

  // ─── Documents & Consents ───────────────────────────────────

  /** List my documents (pending + signed) */
  app.get('/documents', async (request) => {
    return consentService.getMyDocuments(request.org!.orgId, request.user!.id);
  });

  /** Get document content */
  app.get('/documents/:docId', async (request) => {
    const { docId } = request.params as { docId: string };
    const doc = await consentService.getDocumentById(docId);
    if (doc.clientId !== request.user!.id) throw new ValidationError('Unauthorized');
    return doc;
  });

  /** Sign a document */
  app.post('/documents/:docId/sign', async (request, reply) => {
    const { docId } = request.params as { docId: string };
    const body = request.body as { name: string };
    if (!body.name) throw new ValidationError('name is required');

    const signed = await consentService.signDocument(docId, request.user!.id, {
      name: body.name,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    await logAudit(request, 'create', 'consent_records', signed.id);
    return signed;
  });

  /** List my consent records */
  app.get('/consents', async (request) => {
    return consentService.getMyConsents(request.org!.orgId, request.user!.id);
  });

  /** Revoke a consent */
  app.post('/consents/:consentId/revoke', async (request) => {
    const { consentId } = request.params as { consentId: string };
    const revoked = await consentService.revokeConsent(consentId, request.user!.id);
    await logAudit(request, 'update', 'consent_records', consentId);
    return revoked;
  });
}
