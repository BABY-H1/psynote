/**
 * Workflow Rule Engine — Phase 12 MVP.
 *
 * Contract:
 *   await runRulesForEvent({ orgId, event, payload, context })
 * is called fire-and-forget from trigger points. It:
 *   1. loads active rules for this orgId + event, sorted by priority desc
 *   2. for each rule: evaluates conditions → if pass, runs actions sequentially
 *   3. writes a row to `workflow_executions` per rule
 *
 * Key safety: only `assign_course` executes automatically. All other actions
 * write to `candidate_pool`, never to external systems.
 */
import { eq, and, or, desc, isNull } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  workflowRules,
  workflowExecutions,
  candidatePool,
  courseEnrollments,
  courseInstances,
} from '../../db/schema.js';
import { createNotification } from '../notification/notification.service.js';
import type {
  WorkflowRule,
  WorkflowCondition,
  WorkflowAction,
  WorkflowActionResult,
  WorkflowActionType,
  WorkflowTriggerEvent,
  CandidateKind,
  CandidatePriority,
} from '@psynote/shared';

// ─── Public API ──────────────────────────────────────────────────

export interface TriggerContext {
  orgId: string;
  event: WorkflowTriggerEvent;
  payload: TriggerPayload;
  /** Optional user who caused the event (used for source tracking). */
  triggeringUserId?: string | null;
}

/**
 * Payload shape for `assessment_result.created`. Other events will add their
 * own discriminant once we extend the trigger set.
 *
 * Notes:
 *   - `dimensionScores` keys are `dimensionId` (uuid) — the engine uses them
 *      to evaluate `dimension_score:<dimensionId>` conditions.
 *   - `itemValues` maps `itemId → numeric value` — used by `item_value:<id>`
 *      conditions. Populated by `triage-automation.service.ts` from
 *      `assessmentResults.answers`.
 */
export interface TriggerPayload {
  resultId: string;
  userId: string | null;
  assessmentId: string;
  riskLevel: string;
  totalScore?: number;
  dimensionScores?: Record<string, number>;
  itemValues?: Record<string, number>;
  orgType?: string;
}

/**
 * Fire-and-forget entry point. Never throws — failures are logged so the
 * calling flow (e.g. assessment submission) is never blocked.
 */
export async function runRulesForEvent(ctx: TriggerContext): Promise<void> {
  try {
    const rules = await loadActiveRules(ctx.orgId, ctx.event, ctx.payload.assessmentId || null);
    for (const rule of rules) {
      await executeRule(rule, ctx);
    }
  } catch (err) {
    console.warn('[rule-engine] top-level failure (non-blocking):', err);
  }
}

// ─── Internals ───────────────────────────────────────────────────

/**
 * Load rules that could fire for this event. Scoping logic:
 *   - Rule.scopeAssessmentId === payload.assessmentId → include
 *   - Rule.scopeAssessmentId IS NULL                  → include (cross-assessment / global)
 *   - Otherwise                                       → excluded (belongs to a different assessment)
 */
async function loadActiveRules(
  orgId: string,
  event: WorkflowTriggerEvent,
  assessmentId: string | null,
): Promise<WorkflowRule[]> {
  const scopeFilter = assessmentId
    ? or(
        eq(workflowRules.scopeAssessmentId, assessmentId),
        isNull(workflowRules.scopeAssessmentId),
      )!
    : isNull(workflowRules.scopeAssessmentId);

  const rows = await db
    .select()
    .from(workflowRules)
    .where(and(
      eq(workflowRules.orgId, orgId),
      eq(workflowRules.triggerEvent, event),
      eq(workflowRules.isActive, true),
      scopeFilter,
    ))
    .orderBy(desc(workflowRules.priority));

  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    scopeAssessmentId: r.scopeAssessmentId,
    name: r.name,
    description: r.description,
    triggerEvent: r.triggerEvent as WorkflowTriggerEvent,
    conditions: (r.conditions as WorkflowCondition[]) || [],
    actions: (r.actions as WorkflowAction[]) || [],
    isActive: r.isActive,
    priority: r.priority,
    source: r.source,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function executeRule(rule: WorkflowRule, ctx: TriggerContext): Promise<void> {
  const matched = evaluateConditions(rule.conditions, ctx.payload);
  const actionResults: WorkflowActionResult[] = [];

  let overallStatus: 'success' | 'partial' | 'failed' | 'skipped' = matched ? 'success' : 'skipped';
  let errorMessage: string | null = null;

  if (matched) {
    let anySuccess = false;
    let anyFail = false;

    for (const action of rule.actions) {
      try {
        const result = await executeAction(action, rule, ctx);
        actionResults.push(result);
        if (result.status === 'success') anySuccess = true;
        if (result.status === 'failed') anyFail = true;
      } catch (err) {
        anyFail = true;
        actionResults.push({
          actionType: action.type,
          status: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (anyFail && anySuccess) overallStatus = 'partial';
    else if (anyFail) { overallStatus = 'failed'; errorMessage = '部分动作执行失败'; }
    else overallStatus = 'success';
  }

  try {
    await db.insert(workflowExecutions).values({
      orgId: ctx.orgId,
      ruleId: rule.id,
      triggerEvent: ctx.event,
      eventPayload: ctx.payload as unknown as Record<string, unknown>,
      conditionsMatched: matched,
      actionsResult: actionResults as unknown as Record<string, unknown>[],
      status: overallStatus,
      errorMessage,
    });
  } catch (err) {
    console.warn('[rule-engine] failed to write execution log:', err);
  }
}

// ─── Condition evaluation ────────────────────────────────────────

function evaluateConditions(conditions: WorkflowCondition[], payload: TriggerPayload): boolean {
  // MVP: conditions are AND-joined. Empty conditions list = always pass.
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateOne(c, payload));
}

function evaluateOne(c: WorkflowCondition, payload: TriggerPayload): boolean {
  const actual = getFieldValue(c.field, payload);
  if (actual === undefined || actual === null) return false;

  // Coerce numeric string values when comparing to numbers (screening rules
  // sometimes come from UI as string).
  const actualNum = typeof actual === 'number' ? actual : Number(actual);
  const valueNum = typeof c.value === 'number' ? c.value : Number(c.value);

  switch (c.operator) {
    case 'eq':  return actual === c.value || actualNum === valueNum;
    case 'neq': return actual !== c.value && actualNum !== valueNum;
    case 'in':  return Array.isArray(c.value) && (c.value as unknown[]).includes(actual);
    case 'not_in': return Array.isArray(c.value) && !(c.value as unknown[]).includes(actual);
    case 'gte': return Number.isFinite(actualNum) && Number.isFinite(valueNum) && actualNum >= valueNum;
    case 'lte': return Number.isFinite(actualNum) && Number.isFinite(valueNum) && actualNum <= valueNum;
    case 'gt':  return Number.isFinite(actualNum) && Number.isFinite(valueNum) && actualNum >  valueNum;
    case 'lt':  return Number.isFinite(actualNum) && Number.isFinite(valueNum) && actualNum <  valueNum;
    default: return false;
  }
}

/**
 * Returns the payload value for a given condition field. Handles both static
 * names and dynamic prefixed forms:
 *   - `dimension_score:<dimensionId>` → `payload.dimensionScores[dimensionId]`
 *   - `item_value:<itemId>`           → `payload.itemValues[itemId]`
 */
function getFieldValue(field: string, payload: TriggerPayload): string | number | null {
  // Static fields
  switch (field) {
    case 'risk_level':    return payload.riskLevel;
    case 'assessment_id': return payload.assessmentId;
    case 'org_type':      return payload.orgType ?? null;
    case 'total_score':   return typeof payload.totalScore === 'number' ? payload.totalScore : null;
  }

  // Dynamic fields
  if (field.startsWith('dimension_score:')) {
    const dimId = field.slice('dimension_score:'.length);
    const v = payload.dimensionScores?.[dimId];
    return typeof v === 'number' ? v : null;
  }
  if (field.startsWith('item_value:')) {
    const itemId = field.slice('item_value:'.length);
    const v = payload.itemValues?.[itemId];
    return typeof v === 'number' ? v : null;
  }

  return null;
}

// ─── Action executors ────────────────────────────────────────────

async function executeAction(
  action: WorkflowAction,
  rule: WorkflowRule,
  ctx: TriggerContext,
): Promise<WorkflowActionResult> {
  switch (action.type) {
    case 'assign_course':
      return assignCourseAction(action, rule, ctx);
    case 'create_episode_candidate':
      return createCandidate('episode_candidate', 'normal', action, rule, ctx);
    case 'create_group_candidate':
      return createCandidate('group_candidate', 'normal', action, rule, ctx);
    case 'create_crisis_candidate':
      return createCandidate('crisis_candidate', 'urgent', action, rule, ctx);
    case 'notify_internal':
      return notifyInternalAction(action, rule, ctx);
    default:
      return { actionType: action.type as WorkflowActionType, status: 'failed', detail: `Unknown action type` };
  }
}

/**
 * Auto-enroll the triggering client in a course. This is the only action
 * that fires without human review because enrollment is non-coercive —
 * the client still decides whether to actually take the course.
 */
async function assignCourseAction(
  action: WorkflowAction,
  _rule: WorkflowRule,
  ctx: TriggerContext,
): Promise<WorkflowActionResult> {
  const cfg = action.config || {};
  const courseInstanceId = cfg.courseInstanceId as string | undefined;
  if (!courseInstanceId) {
    return { actionType: 'assign_course', status: 'failed', detail: 'courseInstanceId is required in action config' };
  }
  if (!ctx.payload.userId) {
    return { actionType: 'assign_course', status: 'skipped', detail: '触发事件没有 userId(匿名测评?)' };
  }

  // Look up the course id via instance
  const [instance] = await db
    .select({ id: courseInstances.id, courseId: courseInstances.courseId })
    .from(courseInstances)
    .where(eq(courseInstances.id, courseInstanceId))
    .limit(1);
  if (!instance) {
    return { actionType: 'assign_course', status: 'failed', detail: 'course instance not found' };
  }

  // Check existing enrollment to avoid the unique index error
  const [existing] = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, instance.courseId),
      eq(courseEnrollments.userId, ctx.payload.userId),
    ))
    .limit(1);
  if (existing) {
    return { actionType: 'assign_course', status: 'skipped', detail: '该来访者已注册此课程', refId: existing.id };
  }

  const [enrollment] = await db
    .insert(courseEnrollments)
    .values({
      courseId: instance.courseId,
      instanceId: instance.id,
      userId: ctx.payload.userId,
      enrollmentSource: 'auto_rule',
      approvalStatus: 'auto_approved',
    })
    .returning({ id: courseEnrollments.id });

  return { actionType: 'assign_course', status: 'success', refId: enrollment.id };
}

/**
 * Write a pending entry to `candidate_pool`. The UI surfaces this as a
 * to-do for the relevant role (counselor / supervisor / group facilitator).
 */
async function createCandidate(
  kind: CandidateKind,
  priority: CandidatePriority,
  action: WorkflowAction,
  rule: WorkflowRule,
  ctx: TriggerContext,
): Promise<WorkflowActionResult> {
  if (!ctx.payload.userId) {
    return { actionType: `create_${kind.replace('_candidate', '')}_candidate` as WorkflowActionType, status: 'skipped', detail: '触发事件没有 userId(匿名测评?)' };
  }

  const cfg = action.config || {};
  const suggestion = (cfg.suggestion as string | undefined) || rule.name;
  const reason = (cfg.reason as string | undefined)
    || `由规则「${rule.name}」触发 · 风险等级 ${ctx.payload.riskLevel}`;
  const assignedToUserId = (cfg.assignedToUserId as string | undefined) || undefined;

  const [entry] = await db
    .insert(candidatePool)
    .values({
      orgId: ctx.orgId,
      clientUserId: ctx.payload.userId,
      kind,
      suggestion,
      reason,
      priority: (cfg.priority as CandidatePriority | undefined) || priority,
      sourceRuleId: rule.id,
      sourceResultId: ctx.payload.resultId,
      sourcePayload: ctx.payload as unknown as Record<string, unknown>,
      status: 'pending',
      assignedToUserId,
    })
    .returning({ id: candidatePool.id });

  // Ping the assignee (if any) via internal notification so they see the new candidate.
  if (assignedToUserId) {
    try {
      await createNotification({
        orgId: ctx.orgId,
        userId: assignedToUserId,
        type: 'candidate_pending',
        title: `新的${suggestion}`,
        body: reason,
        refType: 'candidate_pool',
        refId: entry.id,
      });
    } catch {}
  }

  return {
    actionType: `create_${kind.replace('_candidate', '')}_candidate` as WorkflowActionType,
    status: 'success',
    refId: entry.id,
  };
}

async function notifyInternalAction(
  action: WorkflowAction,
  rule: WorkflowRule,
  ctx: TriggerContext,
): Promise<WorkflowActionResult> {
  const cfg = action.config || {};
  const targetRole = cfg.role as string | undefined; // 'org_admin' | 'counselor' | specific userId
  const targetUserId = cfg.userId as string | undefined;
  const title = (cfg.title as string | undefined) || `规则触发:${rule.name}`;
  const body = (cfg.body as string | undefined) || `风险等级 ${ctx.payload.riskLevel}`;

  try {
    if (targetUserId) {
      await createNotification({
        orgId: ctx.orgId,
        userId: targetUserId,
        type: 'rule_triggered',
        title,
        body,
        refType: 'workflow_rule',
        refId: rule.id,
      });
      return { actionType: 'notify_internal', status: 'success', detail: `Notified user ${targetUserId}` };
    }

    if (targetRole) {
      // Resolve users with this role in the org, then notify each.
      const { orgMembers } = await import('../../db/schema.js');
      const targets = await db
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, ctx.orgId),
          eq(orgMembers.role, targetRole),
          eq(orgMembers.status, 'active'),
        ));

      for (const t of targets) {
        await createNotification({
          orgId: ctx.orgId,
          userId: t.userId,
          type: 'rule_triggered',
          title,
          body,
          refType: 'workflow_rule',
          refId: rule.id,
        });
      }
      return { actionType: 'notify_internal', status: 'success', detail: `Notified ${targets.length} ${targetRole}(s)` };
    }

    return { actionType: 'notify_internal', status: 'failed', detail: 'role or userId required in config' };
  } catch (err) {
    return {
      actionType: 'notify_internal',
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
