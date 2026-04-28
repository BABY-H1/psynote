/**
 * Workflow rule engine — HTTP routes.
 *
 * Under /api/orgs/:orgId/workflow:
 *   GET    /rules                 — list all rules
 *   GET    /rules/:ruleId         — rule detail
 *   POST   /rules                 — create
 *   PATCH  /rules/:ruleId         — update
 *   DELETE /rules/:ruleId         — delete
 *   GET    /executions?ruleId=… — execution log
 *
 *   GET    /candidates            — list candidate entries (filter by status / kind)
 *   POST   /candidates/:id/accept   — mark accepted (optional resolvedRef)
 *   POST   /candidates/:id/dismiss  — mark dismissed with reason
 *
 * All endpoints require org_admin role (authoring rules) except candidate
 * list/handle which also allows counselor.
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  workflowRules,
  workflowExecutions,
  candidatePool,
  users,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { logAudit } from '../../middleware/audit.js';
import * as crisisService from '../crisis/crisis-case.service.js';
import * as episodeService from '../counseling/episode.service.js';
import type {
  CandidateKind,
  CandidateStatus,
  WorkflowAction,
  WorkflowCondition,
} from '@psynote/shared';

export async function workflowRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  // ─── Rules ─────────────────────────────────────────────────────

  app.get('/rules', async (request) => {
    const orgId = request.org!.orgId;
    const rules = await db
      .select()
      .from(workflowRules)
      .where(eq(workflowRules.orgId, orgId))
      .orderBy(desc(workflowRules.priority), desc(workflowRules.createdAt));
    return rules;
  });

  app.get('/rules/:ruleId', async (request) => {
    const orgId = request.org!.orgId;
    const { ruleId } = request.params as { ruleId: string };
    const [rule] = await db
      .select()
      .from(workflowRules)
      .where(and(eq(workflowRules.id, ruleId), eq(workflowRules.orgId, orgId)))
      .limit(1);
    if (!rule) throw new NotFoundError('Workflow rule', ruleId);
    return rule;
  });

  app.post('/rules', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      name: string;
      description?: string;
      triggerEvent: string;
      conditions?: WorkflowCondition[];
      actions?: WorkflowAction[];
      isActive?: boolean;
      priority?: number;
      scopeAssessmentId?: string | null;
      source?: string;
    };

    if (!body.name?.trim()) throw new ValidationError('规则名称必填');
    if (!body.triggerEvent) throw new ValidationError('触发事件必填');
    if (body.triggerEvent !== 'assessment_result.created') {
      throw new ValidationError('当前仅支持 assessment_result.created 触发器');
    }

    const [created] = await db
      .insert(workflowRules)
      .values({
        orgId,
        scopeAssessmentId: body.scopeAssessmentId ?? null,
        name: body.name.trim(),
        description: body.description || null,
        triggerEvent: body.triggerEvent,
        conditions: (body.conditions || []) as unknown as object,
        actions: (body.actions || []) as unknown as object,
        isActive: body.isActive ?? true,
        priority: body.priority ?? 0,
        source: body.source || 'manual',
        createdBy: request.user!.id,
      })
      .returning();

    await logAudit(request, 'workflow.rule.created', 'workflow_rules', created.id);
    return reply.status(201).send(created);
  });

  // ─── Assessment-scoped rule sync ────────────────────────────────
  /**
   * Replace *all* rules for a given assessment with the provided list.
   * Called by the assessment wizard on save — simpler than tracking
   * per-rule diffs from the client side.
   *
   * Only affects rules with `source='assessment_wizard'` so any manually-
   * authored rules that happen to be scoped to the same assessment are
   * preserved.
   */
  app.put('/rules/by-assessment/:assessmentId', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { assessmentId } = request.params as { assessmentId: string };
    const body = request.body as {
      rules: Array<Omit<WorkflowCondition, 'id'> extends never ? never : {
        name: string;
        description?: string;
        conditions: WorkflowCondition[];
        actions: WorkflowAction[];
        isActive?: boolean;
        priority?: number;
      }>;
    };

    // Delete existing wizard-authored rules for this assessment
    await db
      .delete(workflowRules)
      .where(and(
        eq(workflowRules.orgId, orgId),
        eq(workflowRules.scopeAssessmentId, assessmentId),
        eq(workflowRules.source, 'assessment_wizard'),
      ));

    if (!Array.isArray(body.rules) || body.rules.length === 0) {
      return { count: 0 };
    }

    const rows = body.rules.map((r) => ({
      orgId,
      scopeAssessmentId: assessmentId,
      name: r.name?.trim() || '(未命名规则)',
      description: r.description || null,
      triggerEvent: 'assessment_result.created',
      conditions: (r.conditions || []) as unknown as object,
      actions: (r.actions || []) as unknown as object,
      isActive: r.isActive ?? true,
      priority: r.priority ?? 0,
      source: 'assessment_wizard',
      createdBy: request.user!.id,
    }));

    const inserted = await db.insert(workflowRules).values(rows).returning({ id: workflowRules.id });
    await logAudit(request, 'workflow.rules.synced', 'workflow_rules', assessmentId);
    return { count: inserted.length };
  });

  /** Get all rules for an assessment — used by the wizard to preload. */
  app.get('/rules/by-assessment/:assessmentId', async (request) => {
    const orgId = request.org!.orgId;
    const { assessmentId } = request.params as { assessmentId: string };
    const rows = await db
      .select()
      .from(workflowRules)
      .where(and(
        eq(workflowRules.orgId, orgId),
        eq(workflowRules.scopeAssessmentId, assessmentId),
      ))
      .orderBy(desc(workflowRules.priority), desc(workflowRules.createdAt));
    return rows;
  });

  app.patch('/rules/:ruleId', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { ruleId } = request.params as { ruleId: string };
    const body = request.body as Partial<{
      name: string;
      description: string;
      conditions: WorkflowCondition[];
      actions: WorkflowAction[];
      isActive: boolean;
      priority: number;
    }>;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.conditions !== undefined) updates.conditions = body.conditions;
    if (body.actions !== undefined) updates.actions = body.actions;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.priority !== undefined) updates.priority = body.priority;

    const [updated] = await db
      .update(workflowRules)
      .set(updates)
      .where(and(eq(workflowRules.id, ruleId), eq(workflowRules.orgId, orgId)))
      .returning();
    if (!updated) throw new NotFoundError('Workflow rule', ruleId);

    await logAudit(request, 'workflow.rule.updated', 'workflow_rules', ruleId);
    return updated;
  });

  app.delete('/rules/:ruleId', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { ruleId } = request.params as { ruleId: string };
    const deleted = await db
      .delete(workflowRules)
      .where(and(eq(workflowRules.id, ruleId), eq(workflowRules.orgId, orgId)))
      .returning({ id: workflowRules.id });
    if (deleted.length === 0) throw new NotFoundError('Workflow rule', ruleId);

    await logAudit(request, 'workflow.rule.deleted', 'workflow_rules', ruleId);
    return { ok: true };
  });

  // ─── Executions ────────────────────────────────────────────────

  app.get('/executions', async (request) => {
    const orgId = request.org!.orgId;
    const { ruleId, limit } = request.query as { ruleId?: string; limit?: string };
    const max = Math.min(parseInt(limit || '50', 10) || 50, 200);

    const conditions = [eq(workflowExecutions.orgId, orgId)];
    if (ruleId) conditions.push(eq(workflowExecutions.ruleId, ruleId));

    const rows = await db
      .select()
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(desc(workflowExecutions.createdAt))
      .limit(max);
    return rows;
  });

  // ─── Candidate Pool ────────────────────────────────────────────

  app.get('/candidates', async (request) => {
    const orgId = request.org!.orgId;
    const { status, kind } = request.query as { status?: string; kind?: string };

    const filters = [eq(candidatePool.orgId, orgId)];
    if (status) {
      const statuses = status.split(',') as CandidateStatus[];
      filters.push(inArray(candidatePool.status, statuses));
    } else {
      // Default: only pending
      filters.push(eq(candidatePool.status, 'pending'));
    }
    if (kind) {
      const kinds = kind.split(',') as CandidateKind[];
      filters.push(inArray(candidatePool.kind, kinds));
    }

    const rows = await db
      .select({
        id: candidatePool.id,
        orgId: candidatePool.orgId,
        clientUserId: candidatePool.clientUserId,
        clientName: users.name,
        clientEmail: users.email,
        kind: candidatePool.kind,
        suggestion: candidatePool.suggestion,
        reason: candidatePool.reason,
        priority: candidatePool.priority,
        sourceRuleId: candidatePool.sourceRuleId,
        sourceResultId: candidatePool.sourceResultId,
        sourcePayload: candidatePool.sourcePayload,
        status: candidatePool.status,
        assignedToUserId: candidatePool.assignedToUserId,
        handledByUserId: candidatePool.handledByUserId,
        handledAt: candidatePool.handledAt,
        handledNote: candidatePool.handledNote,
        resolvedRefType: candidatePool.resolvedRefType,
        resolvedRefId: candidatePool.resolvedRefId,
        createdAt: candidatePool.createdAt,
      })
      .from(candidatePool)
      .innerJoin(users, eq(users.id, candidatePool.clientUserId))
      .where(and(...filters))
      .orderBy(desc(candidatePool.priority), desc(candidatePool.createdAt))
      .limit(200);
    return rows;
  });

  app.post('/candidates/:id/accept', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { id } = request.params as { id: string };
    const body = request.body as { resolvedRefType?: string; resolvedRefId?: string; note?: string };

    // Special handling: crisis_candidate → atomically create careEpisode +
    // crisis_case, then stamp the candidate as accepted pointing at them.
    // This gives the client an episodeId to navigate to so the user lands
    // on the crisis checklist instead of a dead-end "/delivery" stub.
    const [existing] = await db
      .select()
      .from(candidatePool)
      .where(and(eq(candidatePool.id, id), eq(candidatePool.orgId, orgId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Candidate entry', id);
    if (existing.status !== 'pending') {
      throw new ValidationError(`候选已被处理(status=${existing.status})`);
    }

    if (existing.kind === 'crisis_candidate') {
      const created = await crisisService.createFromCandidate({
        orgId,
        candidateId: id,
        acceptorUserId: request.user!.id,
      });

      const [updated] = await db
        .update(candidatePool)
        .set({
          status: 'accepted',
          handledByUserId: request.user!.id,
          handledAt: new Date(),
          handledNote: body.note || null,
          resolvedRefType: 'crisis_case',
          resolvedRefId: created.crisisCaseId,
        })
        .where(and(eq(candidatePool.id, id), eq(candidatePool.orgId, orgId)))
        .returning();

      await logAudit(request, 'candidate.accepted.crisis', 'candidate_pool', id);
      return {
        ...updated,
        // Extra fields so the client can navigate:
        episodeId: created.episodeId,
        crisisCaseId: created.crisisCaseId,
      };
    }

    /**
     * Phase H 扩展: episode_candidate 也原子创建 careEpisode (mirror crisis 模式).
     *
     * 之前这里只 stamp status='accepted', 客户端拿不到 episodeId 没法跳, 跟
     * BUG-007 修复 (lazy-create candidate) 一起把研判分流→处置链路打通: 用户
     * 点 "转个案" → 后端真创建 episode → 前端跳 /episodes/:id.
     *
     * 仅当 kind='episode_candidate' AND body.resolvedRefType='care_episode' 触发.
     * 其他 kind (group/course) 保留现有 stamp-only 行为, 因为它们的处置去向
     * (具体哪个团辅/课程) 还需咨询师在 workbench 选, 不能在 accept 一刀切.
     */
    if (existing.kind === 'episode_candidate' && body.resolvedRefType === 'care_episode') {
      const created = await episodeService.createEpisode({
        orgId,
        clientId: existing.clientUserId,
        counselorId: request.user!.id,
        chiefComplaint: existing.suggestion || '研判分流转入',
        currentRisk: 'level_1', // 起步默认低风险, 咨询师在 episode 里会调
      });

      const [updated] = await db
        .update(candidatePool)
        .set({
          status: 'accepted',
          handledByUserId: request.user!.id,
          handledAt: new Date(),
          handledNote: body.note || null,
          resolvedRefType: 'care_episode',
          resolvedRefId: created.id,
        })
        .where(and(eq(candidatePool.id, id), eq(candidatePool.orgId, orgId)))
        .returning();

      await logAudit(request, 'candidate.accepted', 'candidate_pool', id);
      return {
        ...updated,
        // 客户端 navigate 用 — TriageActionBar 会据此跳 /episodes/:episodeId
        episodeId: created.id,
      };
    }

    // Default path (group/course/etc): just flip the status. 这些 kind 的
    // 实际处置去向需要咨询师在 workbench 选具体团辅/课程, 不能在 accept
    // 一刀切创建实体.
    const [updated] = await db
      .update(candidatePool)
      .set({
        status: 'accepted',
        handledByUserId: request.user!.id,
        handledAt: new Date(),
        handledNote: body.note || null,
        resolvedRefType: body.resolvedRefType || null,
        resolvedRefId: body.resolvedRefId || null,
      })
      .where(and(eq(candidatePool.id, id), eq(candidatePool.orgId, orgId)))
      .returning();

    await logAudit(request, 'candidate.accepted', 'candidate_pool', id);
    return updated;
  });

  app.post('/candidates/:id/dismiss', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string };

    const [updated] = await db
      .update(candidatePool)
      .set({
        status: 'dismissed',
        handledByUserId: request.user!.id,
        handledAt: new Date(),
        handledNote: body.reason || null,
      })
      .where(and(eq(candidatePool.id, id), eq(candidatePool.orgId, orgId)))
      .returning();
    if (!updated) throw new NotFoundError('Candidate entry', id);

    await logAudit(request, 'candidate.dismissed', 'candidate_pool', id);
    return updated;
  });
}
