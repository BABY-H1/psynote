import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, ClipboardList, Plus, X, MessageSquare, FileText } from 'lucide-react';
import type { Course, Assessment } from '@psynote/shared';
import type { CourseWizardState, ChapterFeedbackDraft, ChapterHomeworkDraft } from './CourseWizard';

interface Props {
  state: CourseWizardState;
  onChange: (patch: Partial<CourseWizardState>) => void;
  selectedCourse: Course | null;
  assessments: Assessment[];
}

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const checkboxCls = 'rounded border-slate-300 text-brand-600 focus:ring-brand-500';

const feedbackTypeLabels: Record<string, string> = { text: '文字', rating: '评分', choice: '选择' };
const homeworkTypeLabels: Record<string, string> = { text: '文字', single_choice: '单选', multi_choice: '多选' };

export function DuringPhase({ state, onChange, selectedCourse, assessments }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const chapters = selectedCourse?.chapters || [];

  if (!selectedCourse) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">请先在「开始前」选择课程模板</p>
      </div>
    );
  }

  // ── Feedback helpers ──
  const updateFeedbackQuestion = (chapterIdx: number, qIdx: number, patch: Partial<{ type: string; prompt: string; options: string }>) => {
    const updated = [...state.chapterFeedbacks];
    updated[chapterIdx] = { ...updated[chapterIdx], questions: updated[chapterIdx].questions.map((q, i) => i === qIdx ? { ...q, ...patch } : q) };
    onChange({ chapterFeedbacks: updated });
  };

  const addFeedbackQuestion = (chapterIdx: number) => {
    const updated = [...state.chapterFeedbacks];
    updated[chapterIdx] = {
      ...updated[chapterIdx],
      questions: [...updated[chapterIdx].questions, { id: crypto.randomUUID(), type: 'text', prompt: '' }],
    };
    onChange({ chapterFeedbacks: updated });
  };

  const removeFeedbackQuestion = (chapterIdx: number, qIdx: number) => {
    const updated = [...state.chapterFeedbacks];
    updated[chapterIdx] = { ...updated[chapterIdx], questions: updated[chapterIdx].questions.filter((_, i) => i !== qIdx) };
    onChange({ chapterFeedbacks: updated });
  };

  // ── Homework helpers ──
  const updateHomework = (chapterIdx: number, patch: Partial<ChapterHomeworkDraft>) => {
    const updated = [...state.chapterHomeworks];
    updated[chapterIdx] = { ...updated[chapterIdx], ...patch };
    onChange({ chapterHomeworks: updated });
  };

  // ── Per-chapter assessment ──
  const getChapterAssessments = (chapterIdx: number): string[] => {
    return state.assessmentConfig.perSession?.[String(chapterIdx + 1)] || [];
  };

  const toggleChapterAssessment = (chapterIdx: number, assessmentId: string) => {
    const current = getChapterAssessments(chapterIdx);
    const updated = current.includes(assessmentId) ? current.filter((id) => id !== assessmentId) : [...current, assessmentId];
    onChange({
      assessmentConfig: {
        ...state.assessmentConfig,
        perSession: { ...state.assessmentConfig.perSession, [String(chapterIdx + 1)]: updated },
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">共 {chapters.length} 章</span>
          <span className="text-xs text-slate-400">点击展开可配置每章的反馈、作业和量表</span>
        </div>
      </div>

      {/* Global toggles */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={state.feedbackEnabled} onChange={(e) => onChange({ feedbackEnabled: e.target.checked })} className={checkboxCls} />
          <span className="text-sm text-slate-700 font-medium">课后反馈</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={state.homeworkEnabled} onChange={(e) => onChange({ homeworkEnabled: e.target.checked })} className={checkboxCls} />
          <span className="text-sm text-slate-700 font-medium">课后作业</span>
        </label>
      </div>

      {/* Chapter cards */}
      {chapters.map((chapter, idx) => {
        const isExpanded = expandedIdx === idx;
        const chapterAssessments = getChapterAssessments(idx);
        const feedback = state.chapterFeedbacks[idx];
        const homework = state.chapterHomeworks[idx];

        return (
          <div key={chapter.id || idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Chapter header */}
            <button onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition">
              <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{chapter.title}</div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  {chapterAssessments.length > 0 && (
                    <span className="flex items-center gap-1 text-violet-500">
                      <ClipboardList className="w-3 h-3" /> {chapterAssessments.length} 个量表
                    </span>
                  )}
                  {state.feedbackEnabled && feedback?.questions.length > 0 && (
                    <span className="flex items-center gap-1 text-blue-500">
                      <MessageSquare className="w-3 h-3" /> {feedback.questions.length} 个反馈
                    </span>
                  )}
                  {state.homeworkEnabled && homework?.title && (
                    <span className="flex items-center gap-1 text-green-500">
                      <FileText className="w-3 h-3" /> 有作业
                    </span>
                  )}
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Feedback section */}
                {state.feedbackEnabled && feedback && (
                  <div className="px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-medium text-blue-600">课后反馈</span>
                    </div>
                    <div className="space-y-2">
                      {feedback.questions.map((q, qi) => (
                        <div key={q.id} className="flex gap-2 items-start">
                          <select value={q.type} onChange={(e) => updateFeedbackQuestion(idx, qi, { type: e.target.value })}
                            className="w-20 shrink-0 px-2 py-1.5 border border-slate-200 rounded text-xs">
                            {Object.entries(feedbackTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input type="text" value={q.prompt} onChange={(e) => updateFeedbackQuestion(idx, qi, { prompt: e.target.value })}
                            placeholder="问题内容" className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs" />
                          {q.type === 'choice' && (
                            <input type="text" value={q.options ?? ''} onChange={(e) => updateFeedbackQuestion(idx, qi, { options: e.target.value })}
                              placeholder="选项(逗号分隔)" className="w-40 px-2 py-1.5 border border-slate-200 rounded text-xs" />
                          )}
                          <button onClick={() => removeFeedbackQuestion(idx, qi)} className="p-1 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <button onClick={() => addFeedbackQuestion(idx)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                        <Plus className="w-3 h-3" /> 添加问题
                      </button>
                    </div>
                  </div>
                )}

                {/* Homework section */}
                {state.homeworkEnabled && homework && (
                  <div className="px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs font-medium text-green-600">课后作业</span>
                    </div>
                    <div className="space-y-2">
                      <input type="text" value={homework.title} onChange={(e) => updateHomework(idx, { title: e.target.value })}
                        placeholder="作业标题" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
                      <textarea value={homework.description} onChange={(e) => updateHomework(idx, { description: e.target.value })}
                        placeholder="作业说明" rows={2} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
                      <div className="flex gap-2 items-center">
                        <label className="text-xs text-slate-500 shrink-0">题型:</label>
                        <select value={homework.questionType} onChange={(e) => updateHomework(idx, { questionType: e.target.value })}
                          className="px-2 py-1.5 border border-slate-200 rounded text-xs">
                          {Object.entries(homeworkTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      {(homework.questionType === 'single_choice' || homework.questionType === 'multi_choice') && (
                        <input type="text" value={homework.options} onChange={(e) => updateHomework(idx, { options: e.target.value })}
                          placeholder="选项(逗号分隔)" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
                      )}
                    </div>
                  </div>
                )}

                {/* Per-chapter assessments */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-xs font-medium text-violet-600">本章量表</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {assessments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">暂无可用量表</p>
                    ) : assessments.map((a: any) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={chapterAssessments.includes(a.id)}
                          onChange={() => toggleChapterAssessment(idx, a.id)} className={checkboxCls} />
                        {a.title}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
