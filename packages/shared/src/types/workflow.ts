/**
 * Workflow rule engine types — Phase 12 MVP.
 *
 * Central principle: the engine **never** sends external messages (SMS, email
 * to parents, referrals to outside clinics, etc.). "External contact" actions
 * always land in the candidate pool for human review. See `WorkflowAction`
 * below — assign_course is the only action that executes automatically.
 */

// ─── Trigger Events ──────────────────────────────────────────────
/**
 * Event identifiers that can trigger workflow rules.
 * MVP ships with a single trigger; later phases add more.
 */
export type WorkflowTriggerEvent = 'assessment_result.created';

export const WORKFLOW_TRIGGER_LABELS: Record<WorkflowTriggerEvent, string> = {
  'assessment_result.created': '测评结果创建时',
};

// ─── Conditions (dropdown-based for MVP) ─────────────────────────
/**
 * Condition field identifiers. The static ones (risk_level/assessment_id/
 * org_type/total_score) have fixed semantics. The dynamic ones use a
 * prefixed key — `dimension_score:<dimensionId>` to target a specific scale
 * dimension, and `item_value:<itemId>` for a specific scale item.
 *
 * The dynamic form exists so the engine can absorb the legacy
 * `ScreeningCondition` shape from the assessment wizard without lossy
 * translation. The UI still renders field-specific dropdowns; it just
 * encodes the target id into the string.
 */
export type WorkflowConditionFieldStatic =
  | 'risk_level'
  | 'assessment_id'
  | 'org_type'
  | 'total_score';

/**
 * Accepted field values at the JSON layer. Matches static names OR
 * `dimension_score:<uuid>` / `item_value:<uuid>`.
 */
export type WorkflowConditionField = WorkflowConditionFieldStatic | string;

export type WorkflowConditionOperator =
  | 'eq' | 'neq'
  | 'in' | 'not_in'
  | 'gte' | 'lte'
  | 'gt' | 'lt';

export interface WorkflowCondition {
  field: WorkflowConditionField;
  operator: WorkflowConditionOperator;
  /** Value shape depends on the operator — single string/number for eq/neq/gte/lte, array for in/not_in */
  value: string | number | string[] | number[];
  /** Optional human label shown on the condition chip (e.g. "PHQ-9 第 9 题"). */
  label?: string;
}

// ─── Actions ─────────────────────────────────────────────────────

/**
 * `assign_course` is the only action that runs automatically — registers
 * an enrollment for the triggering client. Everything else creates a
 * pending entry in `candidate_pool` for a human to decide.
 */
export type WorkflowActionType =
  | 'assign_course'              // auto-enroll client in a course (only auto action)
  | 'create_episode_candidate'   // add to candidate pool for counselor review
  | 'create_group_candidate'     // add to candidate pool for group facilitator review
  | 'create_crisis_candidate'    // add to candidate pool for supervised crisis workflow
  | 'notify_internal';           // in-app notification to org_admin / counselor

export const WORKFLOW_ACTION_LABELS: Record<WorkflowActionType, string> = {
  assign_course: '自动推送课程',
  create_episode_candidate: '加入个案候选池',
  create_group_candidate: '加入团辅候选池',
  create_crisis_candidate: '加入危机候选池',
  notify_internal: '站内通知',
};

/**
 * Categorise actions by **who decides and what happens externally**. Used by
 * the rule editor UI to explain behaviour and to render visual cues.
 *   - auto:      executes immediately, no external contact
 *   - candidate: writes to `candidate_pool`, a human picks it up later
 *   - notify:    writes an in-app notification; never SMS/email
 */
export const WORKFLOW_ACTION_CATEGORY: Record<WorkflowActionType, 'auto' | 'candidate' | 'notify'> = {
  assign_course: 'auto',
  create_episode_candidate: 'candidate',
  create_group_candidate: 'candidate',
  create_crisis_candidate: 'candidate',
  notify_internal: 'notify',
};

export interface WorkflowAction {
  type: WorkflowActionType;
  /** Free-form config per action type. */
  config?: Record<string, unknown>;
  /** Human-readable label the UI renders on the action card. */
  label?: string;
}

// ─── Rule + Execution + Candidate ─────────────────────────────────

export interface WorkflowRule {
  id: string;
  orgId: string;
  /**
   * Scope. When set, the rule only runs when the event references this
   * assessmentId. When null, the rule is "cross-assessment" (reserved for
   * future global-rule UI; not exposed to users today).
   */
  scopeAssessmentId: string | null;
  name: string;
  description: string | null;
  triggerEvent: WorkflowTriggerEvent;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
  priority: number;
  /** 'assessment_wizard' | 'manual' — tracks the authoring origin */
  source: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowActionResult {
  actionType: WorkflowActionType;
  status: 'success' | 'failed' | 'skipped';
  detail?: string;
  /** Foreign key id produced by the action, e.g. a candidate_pool row id. */
  refId?: string;
}

export interface WorkflowExecution {
  id: string;
  orgId: string;
  ruleId: string | null;
  triggerEvent: WorkflowTriggerEvent;
  eventPayload: Record<string, unknown>;
  conditionsMatched: boolean;
  actionsResult: WorkflowActionResult[];
  status: 'success' | 'partial' | 'failed' | 'skipped';
  errorMessage: string | null;
  createdAt: string;
}

// ─── Candidate Pool ──────────────────────────────────────────────

export type CandidateKind =
  | 'episode_candidate'
  | 'group_candidate'
  | 'crisis_candidate'
  | 'course_candidate';

export const CANDIDATE_KIND_LABELS: Record<CandidateKind, string> = {
  episode_candidate: '个案候选',
  group_candidate: '团辅候选',
  crisis_candidate: '危机候选',
  course_candidate: '课程候选',
};

export type CandidatePriority = 'low' | 'normal' | 'high' | 'urgent';

export type CandidateStatus = 'pending' | 'accepted' | 'dismissed' | 'expired';

export interface CandidateEntry {
  id: string;
  orgId: string;
  clientUserId: string;
  clientName?: string;   // joined for UI
  clientEmail?: string;  // joined for UI
  kind: CandidateKind;
  suggestion: string;
  reason: string | null;
  priority: CandidatePriority;
  sourceRuleId: string | null;
  sourceResultId: string | null;
  sourcePayload: Record<string, unknown>;
  status: CandidateStatus;
  assignedToUserId: string | null;
  handledByUserId: string | null;
  handledAt: string | null;
  handledNote: string | null;
  resolvedRefType: string | null;
  resolvedRefId: string | null;
  createdAt: string;
}
