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
import { adminLicenseRoutes } from './modules/admin/admin-license.routes.js';
import { adminTenantRoutes } from './modules/admin/admin-tenant.routes.js';
import { adminDashboardRoutes } from './modules/admin/admin-dashboard.routes.js';
import { adminLibraryRoutes } from './modules/admin/admin-library.routes.js';
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
import { dashboardRoutes } from './modules/org/dashboard.routes.js';
import { publicServiceRoutes, serviceIntakeRoutes } from './modules/org/public-services.routes.js';
// Phase 7c — subscription info (read-only skeleton)
import { subscriptionRoutes } from './modules/org/subscription.routes.js';
// License activation / management
import { licenseRoutes } from './modules/org/license.routes.js';
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
// EAP Enterprise — 国央企版 partnership & assignment
import { eapPartnershipRoutes } from './modules/eap/eap-partnership.routes.js';
import { eapAssignmentRoutes } from './modules/eap/eap-assignment.routes.js';
import { eapEmployeeRoutes } from './modules/eap/eap-employee.routes.js';
import { eapPublicRoutes } from './modules/eap/eap-public.routes.js';
// School — 学校版班级管理 + 学生管理
import { schoolClassRoutes } from './modules/school/school-class.routes.js';
import { schoolStudentRoutes } from './modules/school/school-student.routes.js';
import { eapCrisisRoutes } from './modules/eap/eap-crisis.routes.js';
import { eapAnalyticsRoutes } from './modules/eap/eap-analytics.routes.js';
import { initConfigService, getBootValue } from './lib/config-service.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }
      : undefined,
  },
});

// Load system config from DB before plugin registration
await initConfigService();
const rateLimitMax = getBootValue('limits', 'rateLimitMax', 100);
const fileUploadMaxMB = getBootValue('limits', 'fileUploadMaxMB', 200);

// Plugins
await app.register(cors, { origin: env.CLIENT_URL, credentials: true });
await app.register(rateLimit, { max: rateLimitMax, timeWindow: '1 minute' });
await app.register(fastifyMultipart, { limits: { fileSize: fileUploadMaxMB * 1024 * 1024 } });
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
// License management — exposes POST/DELETE /api/orgs/:orgId/license
await app.register(licenseRoutes, { prefix: '/api/orgs/:orgId' });
// Phase 10 — dashboard stats
await app.register(dashboardRoutes, { prefix: '/api/orgs/:orgId' });
// Phase 10 — service intakes (authenticated)
await app.register(serviceIntakeRoutes, { prefix: '/api/orgs/:orgId/service-intakes' });
// Phase 10 — public services & intake (no auth, registered at root)
await app.register(publicServiceRoutes);

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
await app.register(adminLicenseRoutes, { prefix: '/api/admin/licenses' });
await app.register(adminTenantRoutes, { prefix: '/api/admin/tenants' });
await app.register(adminDashboardRoutes, { prefix: '/api/admin/dashboard' });
await app.register(adminLibraryRoutes, { prefix: '/api/admin/library' });

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

// EAP Enterprise — partnerships, assignments, employees
await app.register(eapPartnershipRoutes, { prefix: '/api/orgs/:orgId/eap/partnerships' });
await app.register(eapAssignmentRoutes, { prefix: '/api/orgs/:orgId/eap/assignments' });
await app.register(eapEmployeeRoutes, { prefix: '/api/orgs/:orgId/eap/employees' });
await app.register(eapCrisisRoutes, { prefix: '/api/orgs/:orgId/eap/crisis' });
await app.register(eapAnalyticsRoutes, { prefix: '/api/orgs/:orgId/eap/analytics' });
await app.register(eapPublicRoutes, { prefix: '/api/public/eap' });

// School — class & student management
await app.register(schoolClassRoutes, { prefix: '/api/orgs/:orgId/school/classes' });
await app.register(schoolStudentRoutes, { prefix: '/api/orgs/:orgId/school/students' });

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
