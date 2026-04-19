import type { FastifyInstance } from 'fastify';
import { applyAiGuards } from './ai-shared.js';
import { aiAssessmentRoutes } from './ai-assessment.routes.js';
import { aiTreatmentRoutes } from './ai-treatment.routes.js';
import { aiScalesMaterialRoutes } from './ai-scales-material.routes.js';
import { aiGroupSchemesRoutes } from './ai-group-schemes.routes.js';
import { aiCourseAuthoringRoutes } from './ai-course-authoring.routes.js';
import { aiTemplatesRoutes } from './ai-templates.routes.js';

/**
 * AI-routes orchestrator. Registered at `/api/orgs/:orgId/ai` by app.ts.
 *
 * This file used to be a 683-line monolith with 38 inline handlers; it's
 * now a thin composition layer that:
 *   1. Applies the shared guard chain (auth + org + scope + timeout +
 *      aiClient-configured check) via `applyAiGuards`.
 *   2. Registers 6 sub-route modules by domain concern.
 *
 * All sub-routes inherit the guard chain via Fastify's plugin-scope hook
 * inheritance — no need to re-register per module.
 *
 * Route set is contract-tested by `ai.routes.test.ts` (route registration
 * snapshot). Any accidental drop/rename of an endpoint fails that test.
 */
export async function aiRoutes(app: FastifyInstance) {
  applyAiGuards(app);

  await app.register(aiAssessmentRoutes);
  await app.register(aiTreatmentRoutes);
  await app.register(aiScalesMaterialRoutes);
  await app.register(aiGroupSchemesRoutes);
  await app.register(aiCourseAuthoringRoutes);
  await app.register(aiTemplatesRoutes);
}
