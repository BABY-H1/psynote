import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, ClipboardList, RotateCcw, Heart } from 'lucide-react';
import type { Assessment, FollowUpRound } from '@psynote/shared';
import type { CourseWizardState } from './CourseWizard';

interface Props {
  state: CourseWizardState;
  onChange: (patch: Partial<CourseWizardState>) => void;
  assessments: Assessment[];
}

const sectionCls = 'bg-white rounded-xl border border-slate-200 overflow-hidden';
const headerCls = 'flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition';
const contentCls = 'px-5 pb-5 space-y-4';
const checkboxCls = 'rounded border-slate-300 text-brand-600 focus:ring-brand-500';

function CollapsibleSection({ title, icon, subtitle, defaultOpen, children }: {
  title: string; icon: React.ReactNode; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className={sectionCls}>
      <button onClick={() => setOpen(!open)} className={headerCls}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className={contentCls}>{children}</div>}
    </div>
  );
}

function AssessmentCheckboxList({ assessments, selected, onToggle }: {
  assessments: Assessment[]; selected: string[]; onToggle: (id: string) => void;
}) {
  if (assessments.length === 0) return <p className="text-xs text-slate-400 italic">暂无可用量表</p>;
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {assessments.map((a: any) => (
        <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={selected.includes(a.id)} onChange={() => onToggle(a.id)} className={checkboxCls} />
          {a.title}
        </label>
      ))}
    </div>
  );
}

export function AfterPhase({ state, onChange, assessments }: Props) {
  const followUpRounds = state.assessmentConfig.followUp || [];

  const toggleAssessment = (field: 'postGroup' | 'satisfaction', id: string) => {
    const current = state.assessmentConfig[field] || [];
    const updated = current.includes(id) ? current.filter((x: string) => x !== id) : [...current, id];
    onChange({ assessmentConfig: { ...state.assessmentConfig, [field]: updated } });
  };

  const addFollowUpRound = () => {
    const lastDelay = followUpRounds.length > 0 ? followUpRounds[followUpRounds.length - 1].delayDays : 0;
    const newRound: FollowUpRound = { assessments: [], delayDays: lastDelay + 30, label: `第${followUpRounds.length + 1}次随访` };
    onChange({ assessmentConfig: { ...state.assessmentConfig, followUp: [...followUpRounds, newRound] } });
  };

  const updateFollowUpRound = (index: number, patch: Partial<FollowUpRound>) => {
    const updated = [...followUpRounds];
    updated[index] = { ...updated[index], ...patch };
    onChange({ assessmentConfig: { ...state.assessmentConfig, followUp: updated } });
  };

  const removeFollowUpRound = (index: number) => {
    onChange({ assessmentConfig: { ...state.assessmentConfig, followUp: followUpRounds.filter((_: any, i: number) => i !== index) } });
  };

  const toggleFollowUpAssessment = (roundIndex: number, assessmentId: string) => {
    const round = followUpRounds[roundIndex];
    const updated = round.assessments.includes(assessmentId)
      ? round.assessments.filter((id: string) => id !== assessmentId)
      : [...round.assessments, assessmentId];
    updateFollowUpRound(roundIndex, { assessments: updated });
  };

  return (
    <div className="space-y-4">
      {/* Post-Course Assessment */}
      <CollapsibleSection title="结课评估" icon={<ClipboardList className="w-4 h-4 text-blue-500" />} defaultOpen>
        <p className="text-xs text-slate-400">课程结束时的效果评估量表</p>
        <AssessmentCheckboxList assessments={assessments} selected={state.assessmentConfig.postGroup || []}
          onToggle={(id) => toggleAssessment('postGroup', id)} />
      </CollapsibleSection>

      {/* Follow-up Assessment */}
      <CollapsibleSection title="随访评估" icon={<RotateCcw className="w-4 h-4 text-green-500" />}
        subtitle={followUpRounds.length > 0 ? `${followUpRounds.length} 轮` : undefined} defaultOpen>
        <p className="text-xs text-slate-400 mb-2">结课后按设定天数自动推送，可配置多轮</p>

        {followUpRounds.length === 0 ? (
          <div className="text-center py-4"><p className="text-xs text-slate-400 mb-2">暂未配置随访评估</p></div>
        ) : (
          <div className="space-y-4">
            {followUpRounds.map((round: FollowUpRound, idx: number) => (
              <div key={idx} className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input value={round.label || ''} onChange={(e) => updateFollowUpRound(idx, { label: e.target.value })}
                      placeholder={`第${idx + 1}次随访`} className="px-2 py-1 border border-slate-200 rounded text-sm bg-white w-32" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">结课后</span>
                      <input type="number" value={round.delayDays}
                        onChange={(e) => updateFollowUpRound(idx, { delayDays: Math.max(1, Number(e.target.value)) })}
                        min={1} className="w-16 px-2 py-1 border border-slate-200 rounded text-sm text-center bg-white" />
                      <span className="text-xs text-slate-500">天</span>
                    </div>
                  </div>
                  <button onClick={() => removeFollowUpRound(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <AssessmentCheckboxList assessments={assessments} selected={round.assessments}
                  onToggle={(id) => toggleFollowUpAssessment(idx, id)} />
              </div>
            ))}
          </div>
        )}
        <button onClick={addFollowUpRound}
          className="w-full border-2 border-dashed border-slate-200 rounded-lg py-3 text-xs text-slate-400 hover:border-brand-300 hover:text-brand-500 transition flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 添加随访轮次
        </button>
      </CollapsibleSection>

      {/* Satisfaction Survey */}
      <CollapsibleSection title="满意度调查" icon={<Heart className="w-4 h-4 text-pink-500" />} defaultOpen={false}>
        <p className="text-xs text-slate-400">收集学员对课程的整体反馈</p>
        <AssessmentCheckboxList assessments={assessments} selected={state.assessmentConfig.satisfaction || []}
          onToggle={(id) => toggleAssessment('satisfaction', id)} />
      </CollapsibleSection>
    </div>
  );
}
