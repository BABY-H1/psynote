import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, ClipboardList, Plus } from 'lucide-react';
import { ContentBlockEditor } from './ContentBlockEditor';
import type { GroupScheme, Assessment, SessionPhase } from '@psynote/shared';
import type { GroupWizardState } from './GroupWizard';

interface Props {
  state: GroupWizardState;
  onChange: (patch: Partial<GroupWizardState>) => void;
  selectedScheme: GroupScheme | null;
  assessments: Assessment[];
}

const checkboxCls = 'rounded border-slate-300 text-brand-600 focus:ring-brand-500';
const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

export function DuringPhase({ state, onChange, selectedScheme, assessments }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');

  const sessions = selectedScheme?.sessions || [];

  // Get per-session assessment config
  const getSessionAssessments = (sessionNumber: number): string[] => {
    return state.assessmentConfig.perSession?.[String(sessionNumber)] || [];
  };

  const setSessionAssessments = (sessionNumber: number, assessmentIds: string[]) => {
    onChange({
      assessmentConfig: {
        ...state.assessmentConfig,
        perSession: {
          ...state.assessmentConfig.perSession,
          [String(sessionNumber)]: assessmentIds,
        },
      },
    });
  };

  const toggleSessionAssessment = (sessionNumber: number, assessmentId: string) => {
    const current = getSessionAssessments(sessionNumber);
    const updated = current.includes(assessmentId)
      ? current.filter((id) => id !== assessmentId)
      : [...current, assessmentId];
    setSessionAssessments(sessionNumber, updated);
  };

  // Get session override
  const getOverride = (sessionNumber: number) => {
    return state.sessionOverrides[sessionNumber] || {};
  };

  const setOverride = (sessionNumber: number, patch: { title?: string; goal?: string }) => {
    onChange({
      sessionOverrides: {
        ...state.sessionOverrides,
        [sessionNumber]: { ...getOverride(sessionNumber), ...patch },
      },
    });
  };

  if (!selectedScheme) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">请先在「开始前」选择方案模板</p>
        <p className="text-xs text-slate-400 mt-1">选择模板后，这里会显示每次活动的配置</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            共 {sessions.length} 次活动
          </span>
          <span className="text-xs text-slate-400">
            点击展开可配置每次活动的量表和内容
          </span>
        </div>
      </div>

      {/* Session cards */}
      {sessions.map((sess, idx) => {
        const sessionNumber = idx + 1;
        const isExpanded = expandedIdx === idx;
        const override = getOverride(sessionNumber);
        const sessionAssessments = getSessionAssessments(sessionNumber);
        const displayTitle = override.title || sess.title;

        return (
          <div key={sess.id || idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Session header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
            >
              <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center shrink-0">
                {sessionNumber}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{displayTitle}</div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  {sess.duration && <span>{sess.duration}</span>}
                  {sessionAssessments.length > 0 && (
                    <span className="flex items-center gap-1 text-violet-500">
                      <ClipboardList className="w-3 h-3" /> {sessionAssessments.length} 个量表
                    </span>
                  )}
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Editable title and goal */}
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">活动标题</label>
                    <input
                      value={override.title ?? sess.title}
                      onChange={(e) => setOverride(sessionNumber, { title: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  {sess.goal && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">活动目标</label>
                      <input
                        value={override.goal ?? sess.goal}
                        onChange={(e) => setOverride(sessionNumber, { goal: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>

                {/* Scheme phases (read-only reference) */}
                {sess.phases && sess.phases.length > 0 && (
                  <div className="px-5 py-3 bg-violet-50/50 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-xs font-medium text-violet-600">方案环节</span>
                    </div>
                    <div className="space-y-1.5">
                      {(sess.phases as SessionPhase[]).map((phase, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div>
                            <span className="font-medium text-slate-700">{phase.name}</span>
                            {phase.duration && <span className="text-slate-400 ml-1">({phase.duration})</span>}
                            {phase.description && <p className="text-slate-500 mt-0.5">{phase.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content blocks */}
                {sess.id && (
                  <ContentBlockEditor schemeSessionId={sess.id} />
                )}

                {/* Per-session assessments */}
                <div className="px-5 py-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-medium text-blue-600">本次活动量表</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">活动结束后参与者需完成的量表</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {assessments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">暂无可用量表</p>
                    ) : (
                      assessments.map((a: any) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={sessionAssessments.includes(a.id)}
                            onChange={() => toggleSessionAssessment(sessionNumber, a.id)}
                            className={checkboxCls}
                          />
                          {a.title}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add extra session */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-4 text-sm text-slate-400 hover:border-brand-300 hover:text-brand-500 transition flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> 添加额外活动
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">活动标题</label>
              <input
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="额外活动标题"
                className={inputCls}
              />
            </div>
            <button
              onClick={() => {
                if (!newSessionTitle.trim()) return;
                // Extra sessions are tracked via sessionOverrides with numbers beyond scheme length
                const nextNum = sessions.length + Object.keys(state.sessionOverrides).filter(
                  (k) => Number(k) > sessions.length,
                ).length + 1;
                setOverride(nextNum, { title: newSessionTitle.trim() });
                setNewSessionTitle('');
                setShowAddForm(false);
              }}
              disabled={!newSessionTitle.trim()}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              添加
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewSessionTitle(''); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
