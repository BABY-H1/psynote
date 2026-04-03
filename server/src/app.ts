import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import { referralRoutes } from './modules/referral/referral.routes.js';
import { followUpRoutes } from './modules/follow-up/follow-up.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { schemeRoutes } from './modules/group/scheme.routes.js';
import { instanceRoutes } from './modules/group/instance.routes.js';
import { enrollmentRoutes } from './modules/group/enrollment.routes.js';
import { courseRoutes } from './modules/course/course.routes.js';
import { consentRoutes } from './modules/compliance/consent.routes.js';
import { complianceReviewRoutes } from './modules/compliance/compliance-review.routes.js';
import { notificationRoutes } from './modules/notification/notification.routes.js';
import { reminderSettingsRoutes, publicAppointmentRoutes } from './modules/notification/reminder-settings.routes.js';
import { clientPortalRoutes } from './modules/client-portal/client.routes.js';

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
await app.register(referralRoutes, { prefix: '/api/orgs/:orgId/referrals' });
await app.register(followUpRoutes, { prefix: '/api/orgs/:orgId/follow-up' });

// AI services
await app.register(aiRoutes, { prefix: '/api/orgs/:orgId/ai' });

// Group domain
await app.register(schemeRoutes, { prefix: '/api/orgs/:orgId/group-schemes' });
await app.register(instanceRoutes, { prefix: '/api/orgs/:orgId/group-instances' });
await app.register(enrollmentRoutes, { prefix: '/api/orgs/:orgId/group-instances' });

// Course domain
await app.register(courseRoutes, { prefix: '/api/orgs/:orgId/courses' });

// Compliance
await app.register(consentRoutes, { prefix: '/api/orgs/:orgId/compliance' });
await app.register(complianceReviewRoutes, { prefix: '/api/orgs/:orgId/compliance' });

// Notifications
await app.register(notificationRoutes, { prefix: '/api/orgs/:orgId/notifications' });

// Reminder settings
await app.register(reminderSettingsRoutes, { prefix: '/api/orgs/:orgId/reminder-settings' });

// Public appointment confirm/cancel (no auth)
await app.register(publicAppointmentRoutes, { prefix: '/api/public/appointments' });

// Client self-service portal
await app.register(clientPortalRoutes, { prefix: '/api/orgs/:orgId/client' });

// Start
try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
