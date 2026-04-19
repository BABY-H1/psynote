import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { clientDashboardRoutes } from './client-dashboard.routes.js';
import { clientAssessmentRoutes } from './client-assessment.routes.js';
import { clientAppointmentsRoutes } from './client-appointments.routes.js';
import { clientGroupsCoursesRoutes } from './client-groups-courses.routes.js';
import { clientMyAssessmentsRoutes } from './client-my-assessments.routes.js';
import { clientCounselorsRoutes } from './client-counselors.routes.js';
import { clientDocumentsConsentsRoutes } from './client-documents-consents.routes.js';

/**
 * Client-portal routes orchestrator — mounted at
 * `/api/orgs/:orgId/client` by app.ts.
 *
 * Historically this file was a 771-line monolith. It now composes seven
 * domain-local sub-route modules, each under the 200-line architectural
 * warning line. The shared `?as=` guardian-impersonation helpers live in
 * `./client-portal-shared.ts`.
 *
 * Route set is contract-tested by `client.routes.test.ts` (22-endpoint
 * snapshot). Any accidental drop / rename fails that test.
 */
export async function clientPortalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  await app.register(clientDashboardRoutes);
  await app.register(clientAssessmentRoutes);
  await app.register(clientAppointmentsRoutes);
  await app.register(clientGroupsCoursesRoutes);
  await app.register(clientMyAssessmentsRoutes);
  await app.register(clientCounselorsRoutes);
  await app.register(clientDocumentsConsentsRoutes);
}
