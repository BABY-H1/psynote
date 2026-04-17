/**
 * Maps the legacy `ScreeningRules` shape (authored in the assessment wizard's
 * "筛查规则" step, possibly via the AI chat helper) into `WorkflowRule[]`
 * that the runtime engine can actually execute.
 *
 * Why this mapper exists: `ScreeningRules` predates the workflow engine and
 * only captures "condition + flag" — it never had an action side because
 * there was no executor reading it. We derive default actions from the
 * legacy `flag` enum below. Users who want different actions can extend the
 * mapping (future iteration) or author rules directly.
 *
 * Flag → default action mapping (minimal surprise):
 *   high_risk     → crisis candidate (urgent), counselor notify
 *   moderate_risk → episode candidate (normal)
 *   attention     → internal notify to counselor
 *   pass / fail   → no action (just a tag — nothing to dispatch)
 */
import type {
  ScreeningRules,
  ScreeningCondition,
  WorkflowCondition,
  WorkflowAction,
  WorkflowConditionOperator,
} from '@psynote/shared';

interface MappedRule {
  name: string;
  description?: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
  priority: number;
}

const LEGACY_OP_TO_WORKFLOW: Record<string, WorkflowConditionOperator> = {
  '>=': 'gte',
  '<=': 'lte',
  '>':  'gt',
  '<':  'lt',
  '==': 'eq',
  '!=': 'neq',
};

export function mapScreeningRulesToWorkflow(rules: ScreeningRules | undefined): MappedRule[] {
  if (!rules || !rules.enabled || !rules.conditions?.length) return [];

  // Current MVP: emit one WorkflowRule per ScreeningCondition. (The
  // `rules.logic` AND/OR across conditions would require merging into a
  // single WorkflowRule with combined conditions — we'll do that in a later
  // iteration. Per-condition rules give users more granular action control
  // anyway.)
  return rules.conditions.map((cond, i) => {
    const workflowCondition = mapCondition(cond);
    const actions = defaultActionsForFlag(cond.flag, cond.targetLabel || cond.flagLabel);
    const name = buildRuleName(cond, i);

    return {
      name,
      description: cond.flagLabel ? `筛查结果:${cond.flagLabel}` : undefined,
      conditions: workflowCondition ? [workflowCondition] : [],
      actions,
      isActive: true,
      priority: flagPriority(cond.flag),
    };
  });
}

function mapCondition(c: ScreeningCondition): WorkflowCondition | null {
  const op = LEGACY_OP_TO_WORKFLOW[c.operator];
  if (!op) return null;

  let field: string;
  switch (c.type) {
    case 'total_score':
      field = 'total_score';
      break;
    case 'risk_level':
      field = 'risk_level';
      break;
    case 'dimension_score':
      if (!c.targetId) return null;
      field = `dimension_score:${c.targetId}`;
      break;
    case 'item_value':
      if (!c.targetId) return null;
      field = `item_value:${c.targetId}`;
      break;
    default:
      return null;
  }

  return {
    field,
    operator: op,
    value: c.value,
    label: c.targetLabel,
  };
}

function defaultActionsForFlag(flag: ScreeningCondition['flag'], contextLabel?: string): WorkflowAction[] {
  const suggestion = contextLabel ? `筛查建议:${contextLabel}` : '筛查建议';

  switch (flag) {
    case 'high_risk':
      return [
        {
          type: 'create_crisis_candidate',
          config: {
            suggestion,
            priority: 'urgent',
            reason: '筛查规则触发 · 高风险',
          },
        },
        {
          type: 'notify_internal',
          config: { role: 'counselor', title: `${suggestion}(高风险)`, body: '请尽快处理此筛查结果' },
        },
      ];
    case 'moderate_risk':
      return [
        {
          type: 'create_episode_candidate',
          config: {
            suggestion,
            priority: 'high',
            reason: '筛查规则触发 · 中度风险',
          },
        },
      ];
    case 'attention':
      return [
        {
          type: 'notify_internal',
          config: { role: 'counselor', title: suggestion, body: '筛查结果需关注' },
        },
      ];
    case 'pass':
    case 'fail':
    default:
      // No runtime action — the flag is informational only.
      return [];
  }
}

function flagPriority(flag: ScreeningCondition['flag']): number {
  switch (flag) {
    case 'high_risk': return 100;
    case 'moderate_risk': return 50;
    case 'attention': return 20;
    default: return 0;
  }
}

function buildRuleName(c: ScreeningCondition, index: number): string {
  const label = c.targetLabel ? `${c.targetLabel} ` : '';
  const flagZh = {
    high_risk: '高风险',
    moderate_risk: '中风险',
    attention: '需关注',
    pass: '通过',
    fail: '未通过',
  }[c.flag] || c.flag;
  return `${label}${c.operator} ${c.value} → ${flagZh}`.trim() || `规则 ${index + 1}`;
}
