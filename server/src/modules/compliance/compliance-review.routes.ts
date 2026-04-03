import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as reviewService from './compliance-review.service.js';

export async function complianceReviewRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Run note compliance review */
  app.post('/review-note/:noteId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { noteId } = request.params as { noteId: string };
    const result = await reviewService.runNoteComplianceReview(noteId);
    await logAudit(request, 'create', 'compliance_reviews', result.id);
    return result;
  });

  /** Run golden thread review */
  app.post('/review-golden-thread/:episodeId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { episodeId } = request.params as { episodeId: string };
    const result = await reviewService.runGoldenThreadReview(request.org!.orgId, episodeId);
    await logAudit(request, 'create', 'compliance_reviews', result.id);
    return result;
  });

  /** Run treatment quality assessment */
  app.post('/review-quality/:noteId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { noteId } = request.params as { noteId: string };
    const result = await reviewService.runQualityAssessment(noteId);
    await logAudit(request, 'create', 'compliance_reviews', result.id);
    return result;
  });

  /** List reviews */
  app.get('/reviews', async (request) => {
    const query = request.query as {
      careEpisodeId?: string; noteId?: string; reviewType?: string; counselorId?: string;
    };
    return reviewService.listReviews(request.org!.orgId, query);
  });
}
