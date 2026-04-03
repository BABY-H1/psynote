import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, RotateCw, XCircle } from 'lucide-react';
import { StatusBadge } from '../../../shared/components';
import type { TreatmentPlan, TreatmentGoal } from '@psynote/shared';

const statusConfig: Record<string, { label: string; variant: 'yellow' | 'green' | 'blue' | 'slate' }> = {
  draft: { label: '草稿', variant: 'yellow' },
  active: { label: '进行中', variant: 'blue' },
  completed: { label: '已完成', variant: 'green' },
  archived: { label: '已归档', variant: 'slate' },
};

const goalStatusIcons: Record<string, React.ReactNode> = {
  active: <Circle className="w-3.5 h-3.5 text-blue-400" />,
  achieved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  revised: <RotateCw className="w-3.5 h-3.5 text-amber-500" />,
  dropped: <XCircle className="w-3.5 h-3.5 text-slate-400" />,
};

const goalStatusLabels: Record<string, string> = {
  active: '进行中', achieved: '已达成', revised: '已调整', dropped: '已放弃',
};

interface Props {
  plan: TreatmentPlan;
  onEdit?: () => void;
  onGoalStatusChange?: (goalId: string, status: string) => void;
}

export function TreatmentPlanCard({ plan, onEdit, onGoalStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[plan.status] || statusConfig.draft;
  const goals = (plan.goals || []) as TreatmentGoal[];
  const achievedCount = goals.filter((g) => g.status === 'achieved').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{plan.title || '未命名计划'}</span>
              <StatusBadge label={status.label} variant={status.variant} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              {plan.approach && <span>{plan.approach}</span>}
              {goals.length > 0 && (
                <>
                  {plan.approach && <span>·</span>}
                  <span>目标 {achievedCount}/{goals.length}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button onClick={onEdit} className="text-xs text-brand-600 hover:text-brand-700">
              编辑
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          {/* Goals */}
          {goals.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-2">治疗目标</h4>
              <div className="space-y-1.5">
                {goals.map((goal) => (
                  <div key={goal.id} className="flex items-start gap-2">
                    {onGoalStatusChange ? (
                      <button
                        onClick={() => {
                          const next = goal.status === 'active' ? 'achieved' : 'active';
                          onGoalStatusChange(goal.id, next);
                        }}
                        className="mt-0.5 flex-shrink-0"
                        title={goalStatusLabels[goal.status]}
                      >
                        {goalStatusIcons[goal.status]}
                      </button>
                    ) : (
                      <span className="mt-0.5 flex-shrink-0">{goalStatusIcons[goal.status]}</span>
                    )}
                    <div className="min-w-0">
                      <div className={`text-sm ${goal.status === 'achieved' ? 'text-slate-400 line-through' : goal.status === 'dropped' ? 'text-slate-400' : 'text-slate-700'}`}>
                        {goal.description}
                      </div>
                      {goal.notes && <div className="text-xs text-slate-400 mt-0.5">{goal.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interventions */}
          {(plan.interventions as { id: string; description: string; frequency?: string }[])?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-2">干预策略</h4>
              <div className="space-y-1">
                {(plan.interventions as { id: string; description: string; frequency?: string }[]).map((item) => (
                  <div key={item.id} className="text-sm text-slate-600">
                    • {item.description}
                    {item.frequency && <span className="text-xs text-slate-400 ml-1">({item.frequency})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session plan */}
          {plan.sessionPlan && (
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-1">咨询安排</h4>
              <div className="text-sm text-slate-600">{plan.sessionPlan}</div>
            </div>
          )}

          {/* Progress notes */}
          {plan.progressNotes && (
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-1">进度备注</h4>
              <div className="text-sm text-slate-600 whitespace-pre-wrap">{plan.progressNotes}</div>
            </div>
          )}

          {/* Review date */}
          {plan.reviewDate && (
            <div className="text-xs text-slate-400">
              下次复查：{plan.reviewDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
