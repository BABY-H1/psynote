import type { FastifyInstance } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { db } from '../../config/database.js';
import {
  careEpisodes, careTimeline, assessmentResults, appointments,
  groupInstances, groupEnrollments, groupSchemes, groupSchemeSessions,
  groupSessionRecords, groupSessionAttendance,
  courses, courseEnrollments,
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

  /**
   * My assessment results.
   *
   * Phase 9β — Only returns results the counselor has explicitly opted in
   * for client visibility. Clients never see scores by default.
   */
  app.get('/results', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    return db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        eq(assessmentResults.clientVisible, true),
        isNull(assessmentResults.deletedAt),
      ))
      .orderBy(desc(assessmentResults.createdAt));
  });

  /**
   * Phase 9β — Single result detail for the portal.
   * Owned by user only. Returns 404 if the counselor hasn't opted-in.
   */
  app.get('/results/:resultId', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { resultId } = request.params as { resultId: string };

    const [row] = await db
      .select()
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.id, resultId),
        eq(assessmentResults.orgId, orgId),
        eq(assessmentResults.userId, userId),
        eq(assessmentResults.clientVisible, true),
        isNull(assessmentResults.deletedAt),
      ))
      .limit(1);

    if (!row) {
      throw new Error('Result not available');
    }
    return row;
  });

  /**
   * Phase 9β — Trajectory query scoped to the calling user only.
   * Filters by clientVisible inside the service layer.
   */
  app.get('/results/trajectory/:scaleId', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { scaleId } = request.params as { scaleId: string };

    const { getTrajectory } = await import('../assessment/result.service.js');
    return getTrajectory(orgId, userId, scaleId, { onlyClientVisible: true });
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

    // Get enrollment counts and user's own enrollment status
    const allEnrollments = await db
      .select()
      .from(groupEnrollments)
      .where(or(...instances.map((i) => eq(groupEnrollments.instanceId, i.id))));

    // Get linked scheme info
    const schemeIds = [...new Set(instances.map((i) => i.schemeId).filter(Boolean))] as string[];
    let schemeMap = new Map<string, any>();
    if (schemeIds.length > 0) {
      const schemes = await db
        .select({ id: groupSchemes.id, title: groupSchemes.title, overallGoal: groupSchemes.overallGoal, targetAudience: groupSchemes.targetAudience, totalSessions: groupSchemes.totalSessions, sessionDuration: groupSchemes.sessionDuration, frequency: groupSchemes.frequency, theory: groupSchemes.theory })
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

  /**
   * Phase 9γ — Group instance detail for the participant.
   *
   * Returns the instance + scheme + sessions in one envelope so the portal
   * can render a session list. Each session is decorated with the
   * participant's attendance status (if any).
   *
   * Verifies the caller is enrolled in this group before returning anything.
   */
  app.get('/groups/:instanceId', async (request) => {
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { instanceId } = request.params as { instanceId: string };

    // Ownership check via enrollment
    const [enrollment] = await db
      .select()
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.userId, userId),
      ))
      .limit(1);
    if (!enrollment) throw new ValidationError('You are not enrolled in this group');

    // Instance + scheme
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

    // Session records (actual instance-time records, may differ from scheme)
    const records = await db
      .select()
      .from(groupSessionRecords)
      .where(eq(groupSessionRecords.instanceId, instanceId))
      .orderBy(groupSessionRecords.sessionNumber);

    // Attendance for the calling user
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

  /**
   * Phase 9γ — Mark attendance for a session record (participant self check-in).
   * POST /api/orgs/:orgId/client/groups/:instanceId/sessions/:sessionRecordId/check-in
   */
  app.post('/groups/:instanceId/sessions/:sessionRecordId/check-in', async (request, reply) => {
    const userId = request.user!.id;
    const { instanceId, sessionRecordId } = request.params as {
      instanceId: string;
      sessionRecordId: string;
    };

    // Resolve enrollment id
    const [enrollment] = await db
      .select()
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, instanceId),
        eq(groupEnrollments.userId, userId),
      ))
      .limit(1);
    if (!enrollment) throw new ValidationError('Not enrolled in this group');

    // Validate the session record belongs to this instance
    const [sessionRecord] = await db
      .select()
      .from(groupSessionRecords)
      .where(and(
        eq(groupSessionRecords.id, sessionRecordId),
        eq(groupSessionRecords.instanceId, instanceId),
      ))
      .limit(1);
    if (!sessionRecord) throw new ValidationError('Session record not found');

    // Upsert attendance
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
    } else {
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
    }
  });

  // ─── Phase 9δ — Referral consent (client-side) ────────────────

  /**
   * GET /api/orgs/:orgId/client/referrals
   * List referrals where the calling user is the subject and status is pending.
   */
  app.get('/referrals', async (request) => {
    const userId = request.user!.id;
    const { referrals: referralsTable } = await import('../../db/schema.js');
    return db
      .select()
      .from(referralsTable)
      .where(and(
        eq(referralsTable.clientId, userId),
        eq(referralsTable.status, 'pending'),
      ));
  });

  /**
   * POST /api/orgs/:orgId/client/referrals/:referralId/consent
   * body: { consent: boolean }
   * Records the client's decision; on consent, mints download token (if external mode)
   * or notifies the platform receiver.
   */
  app.post('/referrals/:referralId/consent', async (request, reply) => {
    const userId = request.user!.id;
    const { referralId } = request.params as { referralId: string };
    const body = request.body as { consent?: boolean };
    if (typeof body.consent !== 'boolean') {
      throw new ValidationError('consent (boolean) is required');
    }

    const referralService = await import('../referral/referral.service.js');
    const updated = await referralService.recordClientConsent(referralId, userId, body.consent);
    return reply.status(200).send(updated);
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
