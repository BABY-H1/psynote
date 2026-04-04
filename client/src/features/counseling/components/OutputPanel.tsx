import React, { useState } from 'react';
import type { WorkMode } from './ChatWorkspace';
import type { TreatmentPlan, TreatmentGoal } from '@psynote/shared';
import { useCreateSessionNote } from '../../../api/useCounseling';
import { useCreateTreatmentPlan, useUpdateTreatmentPlan, useUpdateGoalStatus } from '../../../api/useTreatmentPlan';
import { RiskBadge, useToast } from '../../../shared/components';
import { Save, Edit3, Target, FileText, TrendingUp } from 'lucide-react';
import { BUILT_IN_FORMATS } from './NoteFormatSelector';

interface Props {
  mode: WorkMode;
  episodeId: string;
  clientId: string;
  episode: any;
  // Note output
  noteFields: Record<string, string>;
  noteFormat: string;
  onNoteFieldChange: (key: string, value: string) => void;
  // Plan output
  planSuggestion: any;
  activePlan?: TreatmentPlan;
  plans: TreatmentPlan[];
  // Summary info
  lastNoteSummary?: string;
  lastNoteDate?: string;
  goalProgress?: { total: number; achieved: number };
}

export function OutputPanel({
  mode, episodeId, clientId, episode,
  noteFields, noteFormat, onNoteFieldChange,
  planSuggestion, activePlan, plans,
  lastNoteSummary, lastNoteDate, goalProgress,
}: Props) {
  const createNote = useCreateSessionNote();
  const createPlan = useCreateTreatmentPlan();
  const updateGoalStatus = useUpdateGoalStatus();
  const { toast } = useToast();

  return (
    <div className="flex flex-col h-full">
      {/* Header: client summary (always visible) */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-slate-900">{episode.client?.name || '未知'}</span>
          <RiskBadge level={episode.currentRisk} />
        </div>
        {episode.chiefComplaint && (
          <p className="text-xs text-slate-500 mb-2">{episode.chiefComplaint}</p>
        )}
        <div className="flex gap-3 text-xs text-slate-400">
          {lastNoteDate && <span>上次笔记: {lastNoteDate}</span>}
          {goalProgress && goalProgress.total > 0 && (
            <span>目标: {goalProgress.achieved}/{goalProgress.total}</span>
          )}
        </div>
      </div>

      {/* Mode-specific output */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'note' && (
          <NoteOutput
            fields={noteFields}
            format={noteFormat}
            onChange={onNoteFieldChange}
            onSave={async () => {
              try {
                const fmt = noteFormat;
                const data: any = {
                  careEpisodeId: episodeId,
                  clientId,
                  sessionDate: new Date().toISOString().split('T')[0],
                  noteFormat: fmt,
                };
                if (fmt === 'soap') {
                  data.subjective = noteFields.subjective;
                  data.objective = noteFields.objective;
                  data.assessment = noteFields.assessment;
                  data.plan = noteFields.plan;
                } else {
                  data.fields = noteFields;
                }
                await createNote.mutateAsync(data);
                toast('笔记已保存', 'success');
              } catch {
                toast('保存失败', 'error');
              }
            }}
            isSaving={createNote.isPending}
          />
        )}
        {mode === 'plan' && (
          <PlanOutput
            suggestion={planSuggestion}
            activePlan={activePlan}
            plans={plans}
            episodeId={episodeId}
            onGoalStatusChange={(planId, goalId, status) =>
              updateGoalStatus.mutate({ planId, goalId, status })
            }
          />
        )}
        {mode === 'simulate' && (
          <div className="p-4 text-center text-sm text-slate-400">
            <div className="text-3xl mb-3">🗣️</div>
            <p>模拟来访者对话进行中</p>
            <p className="text-xs mt-1">在左侧和"来访者"对话，练习咨询技巧</p>
          </div>
        )}
        {mode === 'supervise' && (
          <div className="p-4 text-center text-sm text-slate-400">
            <div className="text-3xl mb-3">🎓</div>
            <p>AI 督导进行中</p>
            <p className="text-xs mt-1">在左侧和督导讨论你的个案思考</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Note Output ────────────────────────────────────────────────

function NoteOutput({
  fields, format, onChange, onSave, isSaving,
}: {
  fields: Record<string, string>; format: string;
  onChange: (key: string, value: string) => void;
  onSave: () => void; isSaving: boolean;
}) {
  const fmt = BUILT_IN_FORMATS.find((f) => f.format === format) || BUILT_IN_FORMATS[0];
  const hasContent = Object.values(fields).some((v) => v?.trim());

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {fmt.title} — {format.toUpperCase()}
        </span>
        {hasContent && (
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-500 disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {isSaving ? '保存中...' : '保存笔记'}
          </button>
        )}
      </div>

      {fmt.fieldDefinitions.map((fd) => (
        <div key={fd.key}>
          <label className="block text-xs font-medium text-slate-500 mb-1">{fd.label}</label>
          <textarea
            value={fields[fd.key] || ''}
            onChange={(e) => onChange(fd.key, e.target.value)}
            placeholder={fd.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>
      ))}

      {!hasContent && (
        <div className="text-xs text-slate-400 text-center py-4">
          在左侧和 AI 对话，笔记内容会自动填充到这里
          <br />也可以直接在这里编辑
        </div>
      )}
    </div>
  );
}

// ─── Plan Output ────────────────────────────────────────────────

function PlanOutput({
  suggestion, activePlan, plans, episodeId, onGoalStatusChange,
}: {
  suggestion: any; activePlan?: TreatmentPlan; plans: TreatmentPlan[];
  episodeId: string;
  onGoalStatusChange: (planId: string, goalId: string, status: string) => void;
}) {
  const createPlan = useCreateTreatmentPlan();
  const { toast } = useToast();

  const goals = (activePlan?.goals as TreatmentGoal[]) || [];
  const achievedCount = goals.filter((g) => g.status === 'achieved').length;

  return (
    <div className="p-3 space-y-4">
      {/* Active plan */}
      {activePlan ? (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">当前计划：{activePlan.title || '未命名'}</div>
          {activePlan.approach && <div className="text-xs text-slate-400 mb-2">取向：{activePlan.approach}</div>}

          {/* Progress bar */}
          {goals.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(achievedCount / goals.length) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-500">{achievedCount}/{goals.length}</span>
            </div>
          )}

          {/* Goals */}
          <div className="space-y-1.5">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => onGoalStatusChange(activePlan.id, g.id, g.status === 'active' ? 'achieved' : 'active')}
                  className={`w-4 h-4 rounded border flex-shrink-0 ${
                    g.status === 'achieved' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                  }`}
                >
                  {g.status === 'achieved' && '✓'}
                </button>
                <span className={g.status === 'achieved' ? 'text-slate-400 line-through' : 'text-slate-700'}>
                  {g.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 text-center py-4">
          尚无治疗计划<br />在左侧和 AI 讨论后，建议方案会出现在这里
        </div>
      )}

      {/* AI suggestion */}
      {suggestion && (
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-teal-600 mb-2">AI 建议方案</div>
          <div className="text-xs text-slate-600 mb-2">{suggestion.rationale}</div>

          {suggestion.suggestedGoals?.map((g: any, i: number) => (
            <div key={i} className="text-xs text-slate-600 mb-1">• {g.description}</div>
          ))}

          {suggestion.sessionPlanSuggestion && (
            <div className="text-xs text-slate-400 mt-2">安排：{suggestion.sessionPlanSuggestion}</div>
          )}

          {!activePlan && (
            <button
              onClick={async () => {
                try {
                  await createPlan.mutateAsync({
                    careEpisodeId: episodeId,
                    title: '治疗计划',
                    goals: suggestion.suggestedGoals?.map((g: any) => ({
                      id: crypto.randomUUID(),
                      description: g.description,
                      status: 'active',
                      createdAt: new Date().toISOString(),
                    })) || [],
                    interventions: suggestion.suggestedInterventions?.map((i: any) => ({
                      id: crypto.randomUUID(),
                      description: i.description,
                      frequency: i.frequency,
                    })) || [],
                    sessionPlan: suggestion.sessionPlanSuggestion,
                    status: 'active',
                  });
                  toast('治疗计划已创建', 'success');
                } catch {
                  toast('创建失败', 'error');
                }
              }}
              disabled={createPlan.isPending}
              className="mt-3 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-500 disabled:opacity-50"
            >
              {createPlan.isPending ? '创建中...' : '采纳为治疗计划'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
