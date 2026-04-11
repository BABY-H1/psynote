import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { orgRoutes } from './modules/org/org.routes.js';
import { scaleRoutes } from './modules/assessment/scale.routes.js';
import { assessmentRoutes } from './modules/assessment/assessment.routes.js';
import { resultRoutes, publicResultRoutes } from './modules/assessment/result.routes.js';
import { batchRoutes } from './modules/assessment/batch.routes.js';
import { reportRoutes } from './modules/assessment/report.routes.js';
import { distributionRoutes } from './modules/assessment/distribution.routes.js';
import { episodeRoutes } from './modules/counseling/episode.routes.js';
import { appointmentRoutes } from './modules/counseling/appointment.routes.js';
import { availabilityRoutes } from './modules/counseling/availability.routes.js';
import { sessionNoteRoutes } from './modules/counseling/session-note.routes.js';
import { noteTemplateRoutes } from './modules/counseling/note-template.routes.js';
import { goalLibraryRoutes } from './modules/counseling/goal-library.routes.js';
import { clientProfileRoutes } from './modules/counseling/client-profile.routes.js';
import { treatmentPlanRoutes } from './modules/counseling/treatment-plan.routes.js';
import { aiConversationRoutes } from './modules/counseling/ai-conversation.routes.js';
import { referralRoutes } from './modules/referral/referral.routes.js';
import { followUpRoutes } from './modules/follow-up/follow-up.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { schemeRoutes } from './modules/group/scheme.routes.js';
import { instanceRoutes } from './modules/group/instance.routes.js';
import { enrollmentRoutes } from './modules/group/enrollment.routes.js';
import { sessionRoutes } from './modules/group/session.routes.js';
import { courseRoutes } from './modules/course/course.routes.js';
import { consentRoutes } from './modules/compliance/consent.routes.js';
import { complianceReviewRoutes } from './modules/compliance/compliance-review.routes.js';
import { notificationRoutes } from './modules/notification/notification.routes.js';
import { reminderSettingsRoutes, publicAppointmentRoutes } from './modules/notification/reminder-settings.routes.js';
import { clientPortalRoutes } from './modules/client-portal/client.routes.js';
import { publicEnrollRoutes } from './modules/group/public-enroll.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { clientAssignmentRoutes } from './modules/counseling/client-assignment.routes.js';
import { clientAccessGrantRoutes } from './modules/counseling/client-access-grant.routes.js';
import { uploadRoutes } from './modules/upload/upload.routes.js';
import { courseInstanceRoutes } from './modules/course/instance.routes.js';
import { courseEnrollmentRoutes } from './modules/course/course-enrollment.routes.js';
import { publicCourseEnrollRoutes } from './modules/course/public-course-enroll.routes.js';
import { feedbackRoutes as courseFeedbackRoutes } from './modules/course/feedback.routes.js';
import { homeworkRoutes as courseHomeworkRoutes } from './modules/course/homework.routes.js';
// Phase 5b — cross-module ServiceInstance aggregation
import { deliveryRoutes } from './modules/delivery/delivery.routes.js';
// Phase 6 — person archive (cross-module per-user history)
import { personArchiveRoutes } from './modules/delivery/person-archive.routes.js';
// Phase 7b — org branding settings (logo / theme color / report header+footer)
import { brandingRoutes } from './modules/org/branding.routes.js';
// Phase 7c — subscription info (read-only skeleton)
import { subscriptionRoutes } from './modules/org/subscription.routes.js';
// Phase 9α — Content blocks (C-facing consumable blocks for courses & group sessions)
import { contentBlockRoutes } from './modules/content-block/content-block.routes.js';
import {
  enrollmentResponseRoutes,
  clientEnrollmentResponseRoutes,
} from './modules/enrollment-response/response.routes.js';
// Phase 9δ — Public referral download (no auth, token-gated)
import { publicReferralRoutes } from './modules/referral/public-referral.routes.js';
// Phase 9ε — Org-internal collaboration page (派单 / 授权 / 督导 / 转介接收 / 审计)
import { collaborationRoutes } from './modules/collaboration/collaboration.routes.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }
      : undefined,
  },
});

// Plugins
await app.register(cors, { origin: env.CLIENT_URL, credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(fastifyMultipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB max
await app.register(fastifyStatic, { root: join(process.cwd(), 'uploads'), prefix: '/uploads/', decorateReply: false });

// Error handler
app.setErrorHandler(errorHandler);

// Health check
app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(orgRoutes, { prefix: '/api/orgs' });

// Assessment domain (nested under org context)
await app.register(scaleRoutes, { prefix: '/api/orgs/:orgId/scales' });
await app.register(assessmentRoutes, { prefix: '/api/orgs/:orgId/assessments' });
await app.register(resultRoutes, { prefix: '/api/orgs/:orgId/results' });
await app.register(batchRoutes, { prefix: '/api/orgs/:orgId/assessment-batches' });
await app.register(reportRoutes, { prefix: '/api/orgs/:orgId/reports' });
await app.register(distributionRoutes, { prefix: '/api/orgs/:orgId/assessments/:assessmentId/distributions' });

// Public assessment submission (no auth)
await app.register(publicResultRoutes, { prefix: '/api/public/assessments' });

// Counseling domain
await app.register(episodeRoutes, { prefix: '/api/orgs/:orgId/episodes' });
await app.register(appointmentRoutes, { prefix: '/api/orgs/:orgId/appointments' });
await app.register(availabilityRoutes, { prefix: '/api/orgs/:orgId/availability' });
await app.register(sessionNoteRoutes, { prefix: '/api/orgs/:orgId/session-notes' });
await app.register(noteTemplateRoutes, { prefix: '/api/orgs/:orgId/note-templates' });
await app.register(goalLibraryRoutes, { prefix: '/api/orgs/:orgId/goal-library' });
await app.register(clientProfileRoutes, { prefix: '/api/orgs/:orgId/clients' });
await app.register(treatmentPlanRoutes, { prefix: '/api/orgs/:orgId/treatment-plans' });
await app.register(aiConversationRoutes, { prefix: '/api/orgs/:orgId/ai-conversations' });
await app.register(referralRoutes, { prefix: '/api/orgs/:orgId/referrals' });
await app.register(followUpRoutes, { prefix: '/api/orgs/:orgId/follow-up' });

// AI services
await app.register(aiRoutes, { prefix: '/api/orgs/:orgId/ai' });

// Group domain
await app.register(schemeRoutes, { prefix: '/api/orgs/:orgId/group-schemes' });
await app.register(instanceRoutes, { prefix: '/api/orgs/:orgId/group-instances' });
await app.register(enrollmentRoutes, { prefix: '/api/orgs/:orgId/group-instances' });
await app.register(sessionRoutes, { prefix: '/api/orgs/:orgId/group-instances' });

// Course domain
await app.register(courseRoutes, { prefix: '/api/orgs/:orgId/courses' });
await app.register(courseInstanceRoutes, { prefix: '/api/orgs/:orgId/course-instances' });
await app.register(courseEnrollmentRoutes, { prefix: '/api/orgs/:orgId/course-instances' });
await app.register(courseFeedbackRoutes, { prefix: '/api/orgs/:orgId/course-instances' });
await app.register(courseHomeworkRoutes, { prefix: '/api/orgs/:orgId/course-instances' });

// Delivery aggregation (Phase 5b) — exposes GET /api/orgs/:orgId/services
await app.register(deliveryRoutes, { prefix: '/api/orgs/:orgId' });
// Person archive (Phase 6) — exposes GET /api/orgs/:orgId/people[/:userId/archive]
await app.register(personArchiveRoutes, { prefix: '/api/orgs/:orgId' });

// Org branding (Phase 7b) — exposes GET/PATCH /api/orgs/:orgId/branding
await app.register(brandingRoutes, { prefix: '/api/orgs/:orgId' });
// Subscription info (Phase 7c) — exposes GET /api/orgs/:orgId/subscription
await app.register(subscriptionRoutes, { prefix: '/api/orgs/:orgId' });

// File upload
await app.register(uploadRoutes, { prefix: '/api/orgs/:orgId/upload' });

// Compliance
await app.register(consentRoutes, { prefix: '/api/orgs/:orgId/compliance' });
await app.register(complianceReviewRoutes, { prefix: '/api/orgs/:orgId/compliance' });

// Notifications
await app.register(notificationRoutes, { prefix: '/api/orgs/:orgId/notifications' });

// Reminder settings
await app.register(reminderSettingsRoutes, { prefix: '/api/orgs/:orgId/reminder-settings' });

// Public appointment confirm/cancel (no auth)
await app.register(publicAppointmentRoutes, { prefix: '/api/public/appointments' });

// Public group enrollment (no auth)
await app.register(publicEnrollRoutes, { prefix: '/api/public/groups' });

// Public course enrollment (no auth)
await app.register(publicCourseEnrollRoutes, { prefix: '/api/public/courses' });

// Client self-service portal
await app.register(clientPortalRoutes, { prefix: '/api/orgs/:orgId/client' });

// System admin
await app.register(adminRoutes, { prefix: '/api/admin' });

// Client assignment & access grants
await app.register(clientAssignmentRoutes, { prefix: '/api/orgs/:orgId/client-assignments' });
await app.register(clientAccessGrantRoutes, { prefix: '/api/orgs/:orgId/client-access-grants' });

// Phase 9α — Content blocks & enrollment responses
await app.register(contentBlockRoutes, { prefix: '/api/orgs/:orgId/content-blocks' });
await app.register(enrollmentResponseRoutes, { prefix: '/api/orgs/:orgId/enrollment-responses' });
await app.register(clientEnrollmentResponseRoutes, { prefix: '/api/orgs/:orgId/client/enrollment-responses' });

// Phase 9δ — Public referral download (no auth)
await app.register(publicReferralRoutes, { prefix: '/api/public/referrals' });

// Phase 9ε — Org-internal collaboration
await app.register(collaborationRoutes, { prefix: '/api/orgs/:orgId/collaboration' });

// Start
try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);

  // Start follow-up worker (requires Redis — gracefully skip if unavailable)
  try {
    const { startFollowUpWorker, scheduleDailyFollowUpScan } = await import('./jobs/follow-up.worker.js');
    startFollowUpWorker();
    await scheduleDailyFollowUpScan();
    app.log.info('Follow-up worker started');
  } catch (workerErr: any) {
    app.log.warn(`Follow-up worker skipped: ${workerErr.message}`);
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
