import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { logAudit } from '../../middleware/audit.js';
import { ForbiddenError, ValidationError } from '../../lib/errors.js';
import { db } from '../../config/database.js';
import { sql, inArray } from 'drizzle-orm';
import {
  careEpisodes, careTimeline, assessmentResults, appointments,
  groupInstances, groupEnrollments, groupSchemes, groupSchemeSessions,
  groupSessionRecords, groupSessionAttendance,
  courses, courseInstances, courseEnrollments,
  assessments,
  notifications, orgMembers, users, clientAssignments,
} from '../../db/schema.js';
import * as appointmentService from '../counseling/appointment.service.js';
import * as consentService from '../compliance/consent.service.js';
import * as parentBindingService from '../parent-binding/parent-binding.service.js';

/**
 * Phase 14 — `?as=<userId>` support for guardian impersonation.
 *
 * If `?as=` is set:
 *   - Verify the caller has an active client_relationships row with target.
 *   - Return the target user id so the route uses the child's data.
 *
 * If absent (or equals caller's own id), return the caller's id (no-op).
 *
 * Routes that opt-in by calling this helper are the **white-listed** ones:
 *   /dashboard, /appointments, /counselors,
 *   /documents, /documents/:id, /documents/:id/sign,
 *   /consents, /consents/:id/revoke
 *
 * Routes that should refuse `?as=` entirely (results, timeline, group/course
 * memberships, referrals, appointment-requests) call `rejectAsParam(req)`
 * instead.
 */
async function resolveTargetUserId(request: FastifyRequest): Promise<string> {
  const callerId = request.user!.id;
  const orgId = request.org!.orgId;
  const asParam = (request.query as any)?.as as string | undefined;
  if (!asParam || asParam === callerId) return callerId;

  const ok = await parentBindingService.hasActiveRelationship({
    orgId,
    holderUserId: callerId,
    relatedClientUserId: asParam,
  });
  if (!ok) throw new ForbiddenError('No active relationship with this user');
  return asParam;
}

function rejectAsParam(request: FastifyRequest) {
  const asParam = (request.query as any)?.as as string | undefined;
  const callerId = request.user!.id;
  if (asParam && asParam !== callerId) {
    throw new ForbiddenError('该数据不可代查');
  }
}

export async function clientPortalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Client dashboard - health overview */
  app.get('/dashboard', async (request) => {
    const callerId = request.user!.id;
    const userId = await resolveTargetUserId(request);
    const orgId = request.org!.orgId;
    const isViewingAs = userId !== callerId;

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

    // Recent results — Phase 14: NEVER expose to a guardian, only to the
    // client themselves. When viewing-as a child, return [].
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

    // Unread notifications count — guardian sees the target's count too
    // (so badges work in the switcher); the actual notification list is
    // not exposed to guardians yet.
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
   * Phase 14 — Guardians cannot see assessment results at all.
   */
  app.get('/results', async (request) => {
    rejectAsParam(request);
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
   * Phase 14 — Guardians cannot see assessment results.
   */
  app.get('/results/:resultId', async (request) => {
    rejectAsParam(request);
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
   * Phase 14 — Guardians cannot see trajectory.
   */
  app.get('/results/trajectory/:scaleId', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;
    const { scaleId } = request.params as { scaleId: string };

    const { getTrajectory } = await import('../assessment/result.service.js');
    return getTrajectory(orgId, userId, scaleId, { onlyClientVisible: true });
  });

  /** My appointments — guardian-readable */
  app.get('/appointments', async (request) => {
    const userId = await resolveTargetUserId(request);
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

  /** My health timeline — Phase 14: guardian-blocked */
  app.get('/timeline', async (request) => {
    rejectAsParam(request);
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

  /** Available groups to join — Phase 14: guardian-blocked */
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

  /** Available courses (published only) — Phase 14: guardian-blocked */
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

  /** My course enrollments — Phase 14: guardian-blocked */
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
   * Phase 9γ — Group instance detail for the participant.
   *
   * Returns the instance + scheme + sessions in one envelope so the portal
   * can render a session list. Each session is decorated with the
   * participant's attendance status (if any).
   *
   * Verifies the caller is enrolled in this group before returning anything.
   */
  app.get('/groups/:instanceId', async (request) => {
    rejectAsParam(request);
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
    rejectAsParam(request);
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
    rejectAsParam(request);
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
    rejectAsParam(request);
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

  /** My group enrollments — Phase 14: guardian-blocked */
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
   * My pending & completed assessments — derived from enrolled instances' assessmentConfig.
   * Returns assessments the user should fill (or has already filled).
   */
  app.get('/my-assessments', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const orgId = request.org!.orgId;

    // 1. Gather assessment IDs from all enrolled group instances
    const groupRows = await db
      .select({
        instanceTitle: groupInstances.title,
        assessmentConfig: groupInstances.assessmentConfig,
        instanceType: sql<string>`'group'`,
      })
      .from(groupEnrollments)
      .innerJoin(groupInstances, eq(groupInstances.id, groupEnrollments.instanceId))
      .where(and(
        eq(groupEnrollments.userId, userId),
        eq(groupEnrollments.status, 'approved'),
        eq(groupInstances.orgId, orgId),
      ));

    // 2. Gather from enrolled course instances
    const courseRows = await db
      .select({
        instanceTitle: courseInstances.title,
        assessmentConfig: courseInstances.assessmentConfig,
        instanceType: sql<string>`'course'`,
      })
      .from(courseEnrollments)
      .innerJoin(courseInstances, eq(courseInstances.id, courseEnrollments.instanceId))
      .where(and(
        eq(courseEnrollments.userId, userId),
        eq(courseInstances.orgId, orgId),
      ));

    // 3. Collect all unique assessment IDs from configs
    const assessmentIdSet = new Set<string>();
    const assessmentContextMap = new Map<string, { instanceTitle: string; phase: string }>();

    for (const row of [...groupRows, ...courseRows]) {
      const config = (row.assessmentConfig || {}) as Record<string, unknown>;
      const phases: [string, string[]][] = [
        ['screening', (config.screening as string[]) || []],
        ['preGroup', (config.preGroup as string[]) || []],
        ['postGroup', (config.postGroup as string[]) || []],
        ['satisfaction', (config.satisfaction as string[]) || []],
      ];
      // Also collect from perSession
      const perSession = (config.perSession || {}) as Record<string, string[]>;
      for (const [, ids] of Object.entries(perSession)) {
        if (Array.isArray(ids)) phases.push(['perSession', ids]);
      }
      // followUp rounds
      const followUp = (config.followUp || []) as Array<{ assessments: string[] }>;
      for (const round of followUp) {
        if (round.assessments) phases.push(['followUp', round.assessments]);
      }

      for (const [phase, ids] of phases) {
        for (const id of ids) {
          assessmentIdSet.add(id);
          if (!assessmentContextMap.has(id)) {
            assessmentContextMap.set(id, { instanceTitle: row.instanceTitle, phase });
          }
        }
      }
    }

    if (assessmentIdSet.size === 0) return [];

    // 4. Fetch assessment metadata (filter out non-UUID strings from legacy data)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assessmentIds = Array.from(assessmentIdSet).filter((id) => uuidRegex.test(id));
    if (assessmentIds.length === 0) return [];
    const assessmentRows = await db
      .select({ id: assessments.id, title: assessments.title, description: assessments.description })
      .from(assessments)
      .where(inArray(assessments.id, assessmentIds));

    // 5. Fetch user's existing results for these assessments
    const resultRows = await db
      .select({ assessmentId: assessmentResults.assessmentId })
      .from(assessmentResults)
      .where(and(
        eq(assessmentResults.userId, userId),
        inArray(assessmentResults.assessmentId, assessmentIds),
      ));
    const completedSet = new Set(resultRows.map((r) => r.assessmentId));

    // 6. Build response
    return assessmentRows.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      completed: completedSet.has(a.id),
      context: assessmentContextMap.get(a.id),
      runnerUrl: `/assess/${a.id}`,
    }));
  });

  /** List counselors in this org (for appointment booking) — guardian-readable */
  app.get('/counselors', async (request) => {
    const orgId = request.org!.orgId;
    const clientUserId = await resolveTargetUserId(request);

    const counselors = await db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        specialties: orgMembers.specialties,
        bio: orgMembers.bio,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, 'counselor'),
        eq(orgMembers.status, 'active'),
      ));

    // Find this client's current primary counselor
    const [assignment] = await db
      .select({ counselorId: clientAssignments.counselorId })
      .from(clientAssignments)
      .where(and(
        eq(clientAssignments.orgId, orgId),
        eq(clientAssignments.clientId, clientUserId),
        eq(clientAssignments.isPrimary, true),
      ))
      .limit(1);

    const myCounselorId = assignment?.counselorId;

    // Sort: my counselor first, then others
    return counselors
      .map((c) => ({ ...c, isMyCounselor: c.id === myCounselorId }))
      .sort((a, b) => {
        if (a.isMyCounselor && !b.isMyCounselor) return -1;
        if (!a.isMyCounselor && b.isMyCounselor) return 1;
        return 0;
      });
  });

  /** Submit an appointment request (client-initiated) — Phase 14: guardian-blocked */
  app.post('/appointment-requests', async (request, reply) => {
    rejectAsParam(request);
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

  /** List my documents (pending + signed) — guardian-readable */
  app.get('/documents', async (request) => {
    const userId = await resolveTargetUserId(request);
    return consentService.getMyDocuments(request.org!.orgId, userId);
  });

  /** Get document content — guardian-readable */
  app.get('/documents/:docId', async (request) => {
    const { docId } = request.params as { docId: string };
    const userId = await resolveTargetUserId(request);
    const doc = await consentService.getDocumentById(docId);
    if (doc.clientId !== userId) throw new ValidationError('Unauthorized');
    return doc;
  });

  /**
   * Sign a document.
   *
   * Phase 14: When `?as=<childUserId>` is set, the caller (guardian) is
   * signing on behalf of the child. The consent_records row records this
   * via `signerOnBehalfOf=guardianUserId` for audit traceability.
   */
  app.post('/documents/:docId/sign', async (request, reply) => {
    const { docId } = request.params as { docId: string };
    const body = request.body as { name: string };
    if (!body.name) throw new ValidationError('name is required');

    const callerId = request.user!.id;
    const targetUserId = await resolveTargetUserId(request);
    const signerOnBehalfOf = targetUserId !== callerId ? callerId : undefined;

    const signed = await consentService.signDocument(docId, targetUserId, {
      name: body.name,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      signerOnBehalfOf,
    });

    await logAudit(request, 'create', 'consent_records', signed.id);
    return signed;
  });

  /** List my consent records — guardian-readable */
  app.get('/consents', async (request) => {
    const userId = await resolveTargetUserId(request);
    return consentService.getMyConsents(request.org!.orgId, userId);
  });

  /** Revoke a consent — guardian-readable (and revokable on behalf of) */
  app.post('/consents/:consentId/revoke', async (request) => {
    const userId = await resolveTargetUserId(request);
    const { consentId } = request.params as { consentId: string };
    const revoked = await consentService.revokeConsent(consentId, userId);
    await logAudit(request, 'update', 'consent_records', consentId);
    return revoked;
  });
}
