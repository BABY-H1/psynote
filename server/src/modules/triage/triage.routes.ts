/**
 * Research-triage HTTP routes.
 *
 * Mounted under /api/orgs/:orgId/triage:
 *   GET   /candidates                      — master list (mode/batchId/level filter)
 *   GET   /buckets                         — L1-L4 + unrated counts
 *   PATCH /results/:resultId/risk-level    — override AI-judged level
 *
 * Detail lookups (single result, episodes, crisis cases) reuse the
 * existing `/results/:id`, `/episodes/:id`, `/crisis/cases/*` endpoints —
 * this module only adds the list aggregation and the one mutation that
 * didn't exist yet.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { validate } from '../../lib/validate.js';
import * as triageService from './triage-queries.service.js';

const PatchLevelBody = z.object({
  riskLevel: z.enum(['level_1', 'level_2', 'level_3', 'level_4']),
  reason: z.string().optional(),
});

function parseMode(value: unknown): triageService.TriageMode {
  return value === 'manual' || value === 'all' ? value : 'screening';
}

export async function triageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  /** List candidates — master query for the left list. */
  app.get('/candidates', async (request) => {
    const q = request.query as {
      mode?: string;
      batchId?: string;
      assessmentId?: string;
      level?: string;
      counselorId?: string;
    };

    return triageService.listTriageCandidates(request.org!.orgId, {
      mode: parseMode(q.mode),
      batchId: q.batchId,
      assessmentId: q.assessmentId,
      level: q.level,
      counselorId: q.counselorId,
      scope: request.dataScope,
    });
  });

  /** Bucket counts per level — powers the sidebar badges. */
  app.get('/buckets', async (request) => {
    const q = request.query as { batchId?: string; assessmentId?: string };
    return triageService.listTriageBuckets(request.org!.orgId, {
      batchId: q.batchId,
      assessmentId: q.assessmentId,
      scope: request.dataScope,
    });
  });

  /** Override AI-judged risk level for a given result. */
  app.patch('/results/:resultId/risk-level', {
    preHandler: [requireRole('org_admin', 'counselor')],
    handler: async (request) => {
      const { resultId } = request.params as { resultId: string };
      const body = validate(PatchLevelBody, request.body);

      const updated = await triageService.updateResultRiskLevel({
        orgId: request.org!.orgId,
        resultId,
        riskLevel: body.riskLevel,
      });

      await logAudit(request, 'triage.risk_level.updated', 'assessment_results', resultId);
      return updated;
    },
  });
}
