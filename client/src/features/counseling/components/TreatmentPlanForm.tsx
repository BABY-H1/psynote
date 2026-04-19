import React, { useState } from 'react';
import { useCreateTreatmentPlan, useUpdateTreatmentPlan } from '../../../api/useTreatmentPlan';
import { useSuggestTreatmentPlan } from '../../../api/useAI';
import { useToast } from '../../../shared/components';
import { Plus, Trash2, Sparkles, ChevronDown, ChevronUp, Loader2, PlusCircle } from 'lucide-react';
import type { TreatmentPlan, TreatmentGoal, TreatmentIntervention } from '@psynote/shared';

interface Props {
  episodeId: string;
  existingPlan?: TreatmentPlan;
  chiefComplaint?: string;
  currentRisk?: 'level_1' | 'level_2' | 'level_3' | 'level_4';
  onDone: () => void;
}

function newId() {
  return crypto.randomUUID();
}

export function TreatmentPlanForm({ episodeId, existingPlan, chiefComplaint, currentRisk, onDone }: Props) {
  const createPlan = useCreateTreatmentPlan();
  const updatePlan = useUpdateTreatmentPlan();
  const suggestPlan = useSuggestTreatmentPlan();
  const { toast } = useToast();

  const [title, setTitle] = useState(existingPlan?.title || '');
  const [approach, setApproach] = useState(existingPlan?.approach || '');
  const [status, setStatus] = useState<string>(existingPlan?.status || 'draft');
  const [goals, setGoals] = useState<TreatmentGoal[]>(
    (existingPlan?.goals as TreatmentGoal[]) || [],
  );
  const [interventions, setInterventions] = useState<TreatmentIntervention[]>(
    (existingPlan?.interventions as TreatmentIntervention[]) || [],
  );
  const [sessionPlan, setSessionPlan] = useState(existingPlan?.sessionPlan || '');
  const [progressNotes, setProgressNotes] = useState(existingPlan?.progressNotes || '');
  const [reviewDate, setReviewDate] = useState(existingPlan?.reviewDate || '');
  const [showAIPanel, setShowAIPanel] = useState(false);

  const addGoal = () => {
    setGoals([...goals, { id: newId(), description: '', status: 'active', createdAt: new Date().toISOString() }]);
  };
  const removeGoal = (id: string) => setGoals(goals.filter((g) => g.id !== id));
  const updateGoal = (id: string, field: string, value: string) => {
    setGoals(goals.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };
  const addIntervention = () => {
    setInterventions([...interventions, { id: newId(), description: '' }]);
  };
  const removeIntervention = (id: string) => setInterventions(interventions.filter((i) => i.id !== id));
  const updateIntervention = (id: string, field: string, value: string) => {
    setInterventions(interventions.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  // AI: adopt a suggested goal
  const adoptGoal = (description: string) => {
    setGoals([...goals, { id: newId(), description, status: 'active', createdAt: new Date().toISOString() }]);
    toast('已采纳目标', 'success');
  };
  // AI: adopt a suggested intervention
  const adoptIntervention = (description: string, frequency?: string) => {
    setInterventions([...interventions, { id: newId(), description, frequency }]);
    toast('已采纳策略', 'success');
  };

  const handleGenerate = async () => {
    try {
      await suggestPlan.mutateAsync({
        chiefComplaint,
        riskLevel: currentRisk || 'level_1',
      });
    } catch {
      toast('AI 生成失败', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      title: title || undefined,
      approach: approach || undefined,
      goals,
      interventions,
      sessionPlan: sessionPlan || undefined,
      progressNotes: progressNotes || undefined,
      reviewDate: reviewDate || undefined,
      status,
    };
    try {
      if (existingPlan) {
        await updatePlan.mutateAsync({ planId: existingPlan.id, ...data });
        toast('治疗计划已更新', 'success');
      } else {
        await createPlan.mutateAsync({ careEpisodeId: episodeId, ...data });
        toast('治疗计划已创建', 'success');
      }
      onDone();
    } catch {
      toast('操作失败', 'error');
    }
  };

  const isPending = createPlan.isPending || updatePlan.isPending;
  const suggestion = suggestPlan.data;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900 mb-4">
        {existingPlan ? '编辑治疗计划' : '新建治疗计划'}
      </h3>

      {/* AI Suggestion Panel */}
      <div className="mb-4 rounded-lg border border-brand-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAIPanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-brand-50 hover:bg-brand-100 transition"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <Sparkles className="w-4 h-4" />
            AI 智能建议
          </span>
          {showAIPanel ? <ChevronUp className="w-4 h-4 text-brand-500" /> : <ChevronDown className="w-4 h-4 text-brand-500" />}
        </button>

        {showAIPanel && (
          <div className="p-4 space-y-3 bg-white">
            <p className="text-xs text-slate-500">
              基于来访者的主诉和风险等级，AI 将建议治疗目标和干预策略。您可以选择性采纳。
            </p>

            {chiefComplaint && (
              <div className="text-xs text-slate-400">主诉：{chiefComplaint}</div>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={suggestPlan.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {suggestPlan.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 生成建议</>
              )}
            </button>

            {suggestPlan.isError && (
              <p className="text-xs text-red-500">生成失败，请检查 AI 服务是否已配置</p>
            )}

            {suggestion && (
              <div className="space-y-4 border-t border-slate-100 pt-3">
                {/* Rationale */}
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                  {suggestion.rationale}
                </div>

                {/* Suggested Goals */}
                {suggestion.suggestedGoals.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-2">建议目标</div>
                    <div className="space-y-1.5">
                      {suggestion.suggestedGoals.map((g, i) => (
                        <div key={i} className="flex items-start gap-2 bg-emerald-50 rounded-lg p-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-700">{g.description}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{g.rationale}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => adoptGoal(g.description)}
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200"
                          >
                            <PlusCircle className="w-3 h-3" /> 采纳
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Interventions */}
                {suggestion.suggestedInterventions.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-2">建议策略</div>
                    <div className="space-y-1.5">
                      {suggestion.suggestedInterventions.map((iv, i) => (
                        <div key={i} className="flex items-start gap-2 bg-blue-50 rounded-lg p-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-700">
                              {iv.description}
                              {iv.frequency && <span className="text-xs text-slate-400 ml-1">({iv.frequency})</span>}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{iv.rationale}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => adoptIntervention(iv.description, iv.frequency)}
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                          >
                            <PlusCircle className="w-3 h-3" /> 采纳
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Session plan suggestion */}
                {suggestion.sessionPlanSuggestion && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">建议安排</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">{suggestion.sessionPlanSuggestion}</span>
                      <button
                        type="button"
                        onClick={() => { setSessionPlan(suggestion.sessionPlanSuggestion); toast('已采纳', 'success'); }}
                        className="text-xs text-brand-600 hover:text-brand-700"
                      >
                        采纳
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title + Approach + Status */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">计划标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：焦虑管理计划"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">理论取向/方法</label>
            <input value={approach} onChange={(e) => setApproach(e.target.value)} placeholder="如：CBT、人本主义、整合取向"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="draft">草稿</option>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>

        {/* Goals */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-500 font-medium">治疗目标</label>
            <button type="button" onClick={addGoal} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> 添加目标
            </button>
          </div>
          {goals.length === 0 && <div className="text-xs text-slate-400 py-2">点击"添加目标"或使用 AI 建议</div>}
          <div className="space-y-2">
            {goals.map((goal) => (
              <div key={goal.id} className="flex gap-2 items-start">
                <select value={goal.status} onChange={(e) => updateGoal(goal.id, 'status', e.target.value)} className="w-20 px-2 py-1.5 border border-slate-200 rounded text-xs flex-shrink-0">
                  <option value="active">进行中</option><option value="achieved">已达成</option><option value="revised">已调整</option><option value="dropped">已放弃</option>
                </select>
                <input value={goal.description} onChange={(e) => updateGoal(goal.id, 'description', e.target.value)} placeholder="描述目标..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm" />
                <input value={goal.notes || ''} onChange={(e) => updateGoal(goal.id, 'notes', e.target.value)} placeholder="备注" className="w-32 px-3 py-1.5 border border-slate-200 rounded text-sm" />
                <button type="button" onClick={() => removeGoal(goal.id)} className="text-slate-400 hover:text-red-500 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Interventions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-500 font-medium">干预策略</label>
            <button type="button" onClick={addIntervention} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> 添加策略
            </button>
          </div>
          {interventions.length === 0 && <div className="text-xs text-slate-400 py-2">点击"添加策略"或使用 AI 建议</div>}
          <div className="space-y-2">
            {interventions.map((item) => (
              <div key={item.id} className="flex gap-2 items-start">
                <input value={item.description} onChange={(e) => updateIntervention(item.id, 'description', e.target.value)} placeholder="描述干预策略..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm" />
                <input value={item.frequency || ''} onChange={(e) => updateIntervention(item.id, 'frequency', e.target.value)} placeholder="频率（可选）" className="w-32 px-3 py-1.5 border border-slate-200 rounded text-sm" />
                <button type="button" onClick={() => removeIntervention(item.id)} className="text-slate-400 hover:text-red-500 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Session plan + review date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">咨询安排</label>
            <input value={sessionPlan} onChange={(e) => setSessionPlan(e.target.value)} placeholder="如：每周一次，预计12-16次"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">下次复查日期</label>
            <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>

        {/* Progress notes */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">进度备注</label>
          <textarea value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
          <button type="submit" disabled={isPending} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {isPending ? '保存中...' : existingPlan ? '更新计划' : '创建计划'}
          </button>
        </div>
      </form>
    </div>
  );
}
