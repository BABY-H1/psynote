import { Check, Clock, Plus, Trash2 } from 'lucide-react';
import type { KeyResult, SessionPhase } from '@psynote/shared';
import { ContentBlockPanel } from '../ContentBlockPanel';
import { PhaseItem } from './PhaseItem';
import { TemplateField } from './SchemeFieldPrimitives';
import type { EditSession } from './types';
import { stripSessionPrefix } from './types';

/**
 * Per-session detail view. Renders the fixed 8-field template (goal,
 * KR checkboxes, theory, phases, materials, homework, evaluation,
 * observation) plus Phase-9α learner-facing content blocks.
 */
export function SessionDetailView({
  session,
  index,
  editing,
  specificGoals,
  onUpdate,
  onRemove,
  onAddPhase,
  onUpdatePhase,
  onRemovePhase,
}: {
  session: EditSession;
  index: number;
  editing: boolean;
  specificGoals: KeyResult[];
  onUpdate: (field: keyof EditSession, value: any) => void;
  onRemove: () => void;
  onAddPhase: () => void;
  onUpdatePhase: (pi: number, field: keyof SessionPhase, value: string) => void;
  onRemovePhase: (pi: number) => void;
}) {
  const displayTitle = stripSessionPrefix(session.title) || `活动 ${index + 1}`;

  const toggleGoal = (goalIdx: number) => {
    const current = session.relatedGoals || [];
    const next = current.includes(goalIdx)
      ? current.filter((g) => g !== goalIdx)
      : [...current, goalIdx];
    onUpdate('relatedGoals', next);
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center">{index + 1}</span>
          {editing ? (
            <input
              value={session.title}
              onChange={(e) => onUpdate('title', e.target.value)}
              placeholder="单元标题"
              className="text-lg font-semibold text-slate-900 border-b-2 border-violet-300 focus:border-violet-500 focus:outline-none bg-transparent px-1"
            />
          ) : (
            <h3 className="text-lg font-semibold text-slate-900">{displayTitle}</h3>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <input
                value={session.duration}
                onChange={(e) => onUpdate('duration', e.target.value)}
                placeholder="时长"
                className="w-24 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button onClick={onRemove} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {!editing && session.duration && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {session.duration}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="p-4">
          <TemplateField label="本次目标" value={session.goal} editing={editing} onChange={(v) => onUpdate('goal', v)} placeholder="本次活动要达成的具体目标" />
        </div>

        {specificGoals.length > 0 && (
          <div className="p-4">
            <label className="text-xs text-slate-500 font-semibold block mb-2">对应 Key Results</label>
            {editing ? (
              <div className="space-y-1.5">
                {specificGoals.map((kr, gi) => (
                  <label key={gi} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={(session.relatedGoals || []).includes(gi)}
                      onChange={() => toggleGoal(gi)}
                      className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <span className="text-xs text-slate-700 group-hover:text-slate-900 font-medium">KR{gi + 1}: {kr.title}</span>
                      {kr.metric && <span className="text-xs text-slate-400 block">衡量: {kr.metric}</span>}
                    </div>
                  </label>
                ))}
              </div>
            ) : (session.relatedGoals || []).length > 0 ? (
              <div className="space-y-1">
                {(session.relatedGoals || []).map((gi) =>
                  specificGoals[gi] ? (
                    <div key={gi} className="text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-green-500" />
                        <span className="font-medium">KR{gi + 1}: {specificGoals[gi].title}</span>
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-300 italic">未关联 KR</p>
            )}
          </div>
        )}

        <div className="p-4">
          <TemplateField label="理论/技术" value={session.sessionTheory} editing={editing} onChange={(v) => onUpdate('sessionTheory', v)} placeholder="本次活动运用的理论或技术（如：认知重构、正念觉察）" />
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-slate-500 font-semibold">活动环节</label>
            {editing && (
              <button onClick={onAddPhase} className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> 添加环节
              </button>
            )}
          </div>
          {(!session.phases || session.phases.length === 0) ? (
            editing ? null : <p className="text-xs text-slate-300 italic">暂无环节</p>
          ) : (
            <div className="space-y-2">
              {(session.phases || []).map((phase, pi) => (
                <PhaseItem
                  key={pi}
                  phase={phase}
                  index={pi}
                  editing={editing}
                  onUpdate={(f, v) => onUpdatePhase(pi, f, v)}
                  onRemove={() => onRemovePhase(pi)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          <TemplateField label="所需材料" value={session.materials} editing={editing} onChange={(v) => onUpdate('materials', v)} placeholder="需要准备的材料和工具" />
        </div>
        <div className="p-4">
          <TemplateField label="课后任务" value={session.homework} editing={editing} onChange={(v) => onUpdate('homework', v)} placeholder={'课后练习或任务（无则填"无"）'} type="textarea" />
        </div>
        <div className="p-4">
          <TemplateField label="本次评估" value={session.sessionEvaluation} editing={editing} onChange={(v) => onUpdate('sessionEvaluation', v)} placeholder={'评估方式（如：行为观察、量表测量，无则填"无"）'} />
        </div>
        <div className="p-4">
          <TemplateField label="观察指标" value={session.assessmentNotes} editing={editing} onChange={(v) => onUpdate('assessmentNotes', v)} placeholder="带领者需要观察的行为指标和要点" />
        </div>
      </div>

      {session.id ? (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">本次会议物料</h3>
            <p className="text-xs text-slate-400 mt-0.5">带组人现场播放 / 参与者填写的内容块，可按"仅带组人 / 仅学员 / 双方可见"分配</p>
          </div>
          <div className="p-4">
            <ContentBlockPanel parentType="group" parentId={session.id} />
          </div>
        </div>
      ) : (
        <div className="mt-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
          保存方案后即可在此添加学员可见 / 带组人专用的内容块（视频、音频、图文、反思等）
        </div>
      )}
    </div>
  );
}
