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

const LazyCreateCandidateBody = z.object({
  kind: z.enum(['episode_candidate', 'group_candidate', 'course_candidate', 'crisis_candidate']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
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

  /**
   * Phase H — BUG-007 真正修复: 把 result 懒转成 candidate_pool 行.
   *
   * 之前研判分流详情面板的"转个案/课程·团辅/忽略"按钮要求 row.candidateId
   * 已存在, 但 candidate_pool 行只在工作流规则引擎触发时产生, 没规则
   * 的机构里这些按钮永远 disabled. 现在前端用户点击时先 POST 这个端点
   * 把 result 转成 candidate_pool 行 (sourceRuleId=null 标记手工创建),
   * 再立即走 accept/dismiss 流程.
   *
   * 幂等: 同 (resultId, kind, status='pending') 已有候选 → 直接返回原行,
   * 不重复 INSERT. 用户重点 "转个案" 不会产生重复.
   */
  app.post('/results/:resultId/candidate', {
    preHandler: [requireRole('org_admin', 'counselor')],
    handler: async (request, reply) => {
      const { resultId } = request.params as { resultId: string };
      const body = validate(LazyCreateCandidateBody, request.body);

      const candidate = await triageService.lazyCreateCandidate({
        orgId: request.org!.orgId,
        resultId,
        kind: body.kind,
        priority: body.priority,
      });

      await logAudit(request, 'candidate.created.manual', 'candidate_pool', candidate.id);
      reply.code(201);
      return candidate;
    },
  });
}
