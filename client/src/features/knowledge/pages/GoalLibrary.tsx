import React, { useState } from 'react';
import { useGoalLibrary, useCreateGoal, useDeleteGoal } from '../../../api/useGoalLibrary';
import type { TreatmentGoalLibraryItem } from '@psynote/shared';
import { PageLoading, EmptyState, StatusBadge, useToast } from '../../../shared/components';
import { Plus, Trash2 } from 'lucide-react';

const problemAreaLabels: Record<string, string> = {
  anxiety: '焦虑', depression: '抑郁', relationship: '人际关系', trauma: '创伤',
  self_esteem: '自尊', grief: '丧失/悲伤', anger: '情绪管理', substance: '成瘾',
  academic: '学业', career: '职业', family: '家庭', other: '其他',
};

const categoryLabels: Record<string, string> = { short_term: '短期', long_term: '长期' };

const visibilityLabels: Record<string, string> = {
  personal: '仅自己', organization: '本机构', public: '公开',
};

export function GoalLibrary() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: goals, isLoading } = useGoalLibrary();
  const { toast } = useToast();

  // Group by problem area
  const grouped = (goals || []).reduce((acc, g) => {
    const area = g.problemArea;
    if (!acc[area]) acc[area] = [];
    acc[area].push(g);
    return acc;
  }, {} as Record<string, TreatmentGoalLibraryItem[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理治疗目标模板，在制定个案治疗计划时可直接选用
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-2">
          <Plus className="w-4 h-4" /> 新建目标
        </button>
      </div>

      {showCreate && <CreateGoalForm onDone={() => setShowCreate(false)} />}

      {isLoading ? <PageLoading /> : !goals || goals.length === 0 ? (
        <EmptyState title="暂无治疗目标" action={{ label: '+ 新建目标', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([area, items]) => (
            <div key={area}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                {problemAreaLabels[area] || area}
                <span className="text-slate-400 font-normal ml-1">({items.length})</span>
              </h3>
              <div className="grid gap-2">
                {items.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: any }) {
  const deleteGoal = useDeleteGoal();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{goal.title}</span>
            {goal.category && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                {categoryLabels[goal.category] || goal.category}
              </span>
            )}
            <span className="text-xs text-slate-400">{visibilityLabels[goal.visibility]}</span>
          </div>
          {goal.description && <p className="text-xs text-slate-500 mt-0.5">{goal.description}</p>}
        </div>
        <button onClick={async () => {
          if (confirm('确定删除？')) {
            try { await deleteGoal.mutateAsync(goal.id); toast('已删除', 'success'); }
            catch { toast('删除失败', 'error'); }
          }
        }} className="text-slate-300 hover:text-red-500 ml-2">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
          {(goal.objectivesTemplate as string[])?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">参考目标</div>
              {(goal.objectivesTemplate as string[]).map((o: string, i: number) => (
                <div key={i} className="text-xs text-slate-600">• {o}</div>
              ))}
            </div>
          )}
          {(goal.interventionSuggestions as string[])?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">建议干预</div>
              {(goal.interventionSuggestions as string[]).map((s: string, i: number) => (
                <div key={i} className="text-xs text-slate-600">• {s}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateGoalForm({ onDone }: { onDone: () => void }) {
  const createGoal = useCreateGoal();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemArea, setProblemArea] = useState('anxiety');
  const [category, setCategory] = useState('short_term');
  const [visibility, setVisibility] = useState('organization');
  const [objectives, setObjectives] = useState('');
  const [interventions, setInterventions] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGoal.mutateAsync({
        title,
        description: description || undefined,
        problemArea,
        category,
        visibility,
        objectivesTemplate: objectives.split('\n').map((s) => s.trim()).filter(Boolean),
        interventionSuggestions: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast('目标已创建', 'success');
      onDone();
    } catch {
      toast('创建失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-3">新建治疗目标</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">目标名称 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="如：减少焦虑症状"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">问题领域 *</label>
            <select value={problemArea} onChange={(e) => setProblemArea(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              {Object.entries(problemAreaLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">描述</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述目标"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">类别</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="short_term">短期</option>
              <option value="long_term">长期</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">可见范围</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="personal">仅自己</option>
              <option value="organization">本机构</option>
              <option value="public">公开</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">参考目标（每行一个）</label>
          <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} placeholder="每周焦虑发作次数减少50%&#10;掌握3种以上应对焦虑的技巧"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">建议干预（每行一个）</label>
          <textarea value={interventions} onChange={(e) => setInterventions(e.target.value)} rows={3} placeholder="认知重构训练&#10;渐进式放松练习&#10;暴露疗法"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
          <button type="submit" disabled={createGoal.isPending || !title}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {createGoal.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
