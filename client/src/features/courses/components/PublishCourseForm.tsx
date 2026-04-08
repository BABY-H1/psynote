import React, { useState, useEffect } from 'react';
import { useCourses } from '../../../api/useCourses';
import {
  useCreateCourseInstance,
  useCreateFeedbackForm,
  useCreateHomeworkDef,
} from '../../../api/useCourseInstances';
import { useToast } from '../../../shared/components';
import { useAuthStore } from '../../../stores/authStore';
import { ArrowLeft, BookOpen, Users, Globe, School, ChevronDown, Plus, X } from 'lucide-react';
import type { Course, CourseChapter } from '@psynote/shared';
import type { CoursePublishMode, FeedbackQuestionType, HomeworkQuestionType } from '@psynote/shared';

// ─── Types ──────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  preselectedCourseId?: string;
}

interface FeedbackQuestionDraft {
  id: string;
  type: FeedbackQuestionType;
  prompt: string;
  options?: string; // comma-separated for choice type
}

interface ChapterFeedbackDraft {
  chapterId: string;
  chapterTitle: string;
  questions: FeedbackQuestionDraft[];
}

interface HomeworkDraft {
  chapterId: string;
  chapterTitle: string;
  title: string;
  description: string;
  questionType: HomeworkQuestionType;
  options: string; // comma-separated for choice types
}

// ─── Helpers ────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs text-slate-500 mb-1';

let _uid = 0;
function uid() {
  return `q_${++_uid}_${Date.now()}`;
}

const publishModeOptions: {
  value: CoursePublishMode;
  label: string;
  desc: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  { value: 'assign', label: '指定学员', desc: '选择具体来访者/学生推送', Icon: Users },
  { value: 'class', label: '按班级/团体', desc: '批量发布给班级或团体', Icon: School },
  { value: 'public', label: '公开报名', desc: '生成报名链接，学员自助报名', Icon: Globe },
];

const feedbackTypeLabels: Record<FeedbackQuestionType, string> = {
  text: '文本',
  rating: '评分',
  choice: '选择',
};

const homeworkTypeLabels: Record<HomeworkQuestionType, string> = {
  text: '文本',
  single_choice: '单选',
  multi_choice: '多选',
};

// ─── Component ──────────────────────────────────────────────────

export function PublishCourseForm({ onClose, preselectedCourseId }: Props) {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);

  // API hooks
  const { data: courses, isLoading: coursesLoading } = useCourses({ status: 'published' });
  const createInstance = useCreateCourseInstance();
  const createFeedback = useCreateFeedbackForm();
  const createHomework = useCreateHomeworkDef();

  // ── Section 1: Course selection
  const [selectedCourseId, setSelectedCourseId] = useState(preselectedCourseId ?? '');
  const selectedCourse = courses?.find((c: Course) => c.id === selectedCourseId) ?? null;

  useEffect(() => {
    if (preselectedCourseId && courses?.some((c: Course) => c.id === preselectedCourseId)) {
      setSelectedCourseId(preselectedCourseId);
    }
  }, [preselectedCourseId, courses]);

  // Auto-fill overrides when course changes
  useEffect(() => {
    if (selectedCourse) {
      setTitleOverride(selectedCourse.title);
      setDescOverride(selectedCourse.description ?? '');
    }
  }, [selectedCourse]);

  // ── Section 2: Publishing config
  const [titleOverride, setTitleOverride] = useState('');
  const [descOverride, setDescOverride] = useState('');
  const [publishMode, setPublishMode] = useState<CoursePublishMode>('assign');
  const [groupLabel, setGroupLabel] = useState('');
  const [capacity, setCapacity] = useState<number | ''>('');

  // ── Section 3: Interactions (collapsible)
  const [interactionsOpen, setInteractionsOpen] = useState(false);

  // Feedback
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [chapterFeedbacks, setChapterFeedbacks] = useState<ChapterFeedbackDraft[]>([]);

  // Homework
  const [homeworkEnabled, setHomeworkEnabled] = useState(false);
  const [chapterHomeworks, setChapterHomeworks] = useState<HomeworkDraft[]>([]);

  // Rebuild interaction drafts when course changes
  useEffect(() => {
    const chapters: CourseChapter[] = selectedCourse?.chapters ?? [];
    setChapterFeedbacks(
      chapters.map((ch) => ({ chapterId: ch.id, chapterTitle: ch.title, questions: [] })),
    );
    setChapterHomeworks(
      chapters.map((ch) => ({
        chapterId: ch.id,
        chapterTitle: ch.title,
        title: '',
        description: '',
        questionType: 'text' as HomeworkQuestionType,
        options: '',
      })),
    );
  }, [selectedCourse]);

  // ── Feedback helpers
  const addFeedbackQuestion = (chapterIdx: number) => {
    setChapterFeedbacks((prev) => {
      const next = [...prev];
      next[chapterIdx] = {
        ...next[chapterIdx],
        questions: [
          ...next[chapterIdx].questions,
          { id: uid(), type: 'text', prompt: '', options: '' },
        ],
      };
      return next;
    });
  };

  const updateFeedbackQuestion = (
    chapterIdx: number,
    qIdx: number,
    patch: Partial<FeedbackQuestionDraft>,
  ) => {
    setChapterFeedbacks((prev) => {
      const next = [...prev];
      const questions = [...next[chapterIdx].questions];
      questions[qIdx] = { ...questions[qIdx], ...patch };
      next[chapterIdx] = { ...next[chapterIdx], questions };
      return next;
    });
  };

  const removeFeedbackQuestion = (chapterIdx: number, qIdx: number) => {
    setChapterFeedbacks((prev) => {
      const next = [...prev];
      const questions = [...next[chapterIdx].questions];
      questions.splice(qIdx, 1);
      next[chapterIdx] = { ...next[chapterIdx], questions };
      return next;
    });
  };

  // ── Homework helpers
  const updateHomework = (chapterIdx: number, patch: Partial<HomeworkDraft>) => {
    setChapterHomeworks((prev) => {
      const next = [...prev];
      next[chapterIdx] = { ...next[chapterIdx], ...patch };
      return next;
    });
  };

  // ── Submit ─────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!selectedCourseId && !!titleOverride.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // 1. Create instance
      const instance = await createInstance.mutateAsync({
        courseId: selectedCourseId,
        title: titleOverride.trim(),
        description: descOverride.trim() || undefined,
        publishMode,
        capacity: publishMode === 'public' && capacity ? Number(capacity) : undefined,
        targetGroupLabel: publishMode === 'class' && groupLabel.trim() ? groupLabel.trim() : undefined,
      });

      const instanceId = (instance as any).id;

      // 2. Create feedback forms
      if (feedbackEnabled) {
        for (const cf of chapterFeedbacks) {
          const validQuestions = cf.questions.filter((q) => q.prompt.trim());
          if (validQuestions.length === 0) continue;
          await createFeedback.mutateAsync({
            instanceId,
            chapterId: cf.chapterId,
            title: `${cf.chapterTitle} - 课后反馈`,
            questions: validQuestions.map((q) => ({
              type: q.type,
              prompt: q.prompt.trim(),
              options: q.type === 'choice' && q.options
                ? q.options.split(',').map((o) => o.trim()).filter(Boolean)
                : undefined,
              required: true,
            })),
            isActive: true,
          });
        }
      }

      // 3. Create homework defs
      if (homeworkEnabled) {
        let sortOrder = 0;
        for (const hw of chapterHomeworks) {
          if (!hw.title.trim()) continue;
          await createHomework.mutateAsync({
            instanceId,
            chapterId: hw.chapterId,
            title: hw.title.trim(),
            description: hw.description.trim() || undefined,
            questionType: hw.questionType,
            options:
              (hw.questionType === 'single_choice' || hw.questionType === 'multi_choice') && hw.options
                ? hw.options.split(',').map((o) => o.trim()).filter(Boolean)
                : undefined,
            isRequired: true,
            sortOrder: sortOrder++,
          });
        }
      }

      toast('课程实例创建成功', 'success');
      onClose();
    } catch {
      toast('创建失败，请重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">创建课程实例</h1>
            <p className="text-xs text-slate-500">从已发布课程创建一个可交付的课程实例</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ─── Section 1: Select Course ─────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">选择课程</h2>

            <div>
              <label className={labelCls}>课程 *</label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className={inputCls}
                disabled={coursesLoading}
              >
                <option value="">
                  {coursesLoading ? '加载中...' : '-- 请选择已发布的课程 --'}
                </option>
                {courses?.map((c: Course) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedCourse && (
              <div className="mt-4 bg-slate-50 rounded-lg p-4 text-sm space-y-1">
                <p className="font-medium text-slate-800">{selectedCourse.title}</p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  {selectedCourse.courseType && <span>类型: {selectedCourse.courseType}</span>}
                  {selectedCourse.targetAudience && (
                    <span>对象: {selectedCourse.targetAudience}</span>
                  )}
                  <span>章节: {selectedCourse.chapters?.length ?? 0} 章</span>
                </div>
                {selectedCourse.description && (
                  <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                    {selectedCourse.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ─── Section 2: Publishing Configuration ──────────── */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">发布配置</h2>
            <div className="space-y-4">
              {/* Title override */}
              <div>
                <label className={labelCls}>实例标题 *</label>
                <input
                  type="text"
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  placeholder="默认使用课程标题"
                  className={inputCls}
                  required
                />
              </div>

              {/* Description override */}
              <div>
                <label className={labelCls}>实例描述</label>
                <textarea
                  value={descOverride}
                  onChange={(e) => setDescOverride(e.target.value)}
                  placeholder="默认使用课程描述"
                  rows={3}
                  className={inputCls}
                />
              </div>

              {/* Publish mode radio cards */}
              <div>
                <label className={labelCls}>发布模式 *</label>
                <div className="grid grid-cols-3 gap-3 mt-1">
                  {publishModeOptions.map(({ value, label, desc, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPublishMode(value)}
                      className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                        publishMode === value
                          ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${publishMode === value ? 'text-brand-600' : 'text-slate-400'}`}
                      />
                      <span
                        className={`text-sm font-medium ${publishMode === value ? 'text-brand-700' : 'text-slate-700'}`}
                      >
                        {label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Class mode: group label */}
              {publishMode === 'class' && (
                <div>
                  <label className={labelCls}>班级/团体名称</label>
                  <input
                    type="text"
                    value={groupLabel}
                    onChange={(e) => setGroupLabel(e.target.value)}
                    placeholder="例如: 高二3班"
                    className={inputCls}
                  />
                </div>
              )}

              {/* Public mode: capacity */}
              {publishMode === 'public' && (
                <div>
                  <label className={labelCls}>报名人数上限</label>
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value ? Number(e.target.value) : '')}
                    placeholder="不填则不限制"
                    className={inputCls}
                  />
                </div>
              )}

              {/* Responsible person */}
              <div>
                <label className={labelCls}>负责人</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                  {user?.name ?? user?.email ?? '当前用户'}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Section 3: Interactions (collapsible) ────────── */}
          <div className="bg-white rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setInteractionsOpen(!interactionsOpen)}
              className="w-full flex items-center justify-between px-6 py-4"
            >
              <h2 className="text-sm font-semibold text-slate-900">配置课后互动（可选）</h2>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${interactionsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {interactionsOpen && (
              <div className="px-6 pb-6 space-y-6 border-t border-slate-100 pt-4">
                {!selectedCourse && (
                  <p className="text-xs text-slate-400">请先选择课程</p>
                )}

                {selectedCourse && (
                  <>
                    {/* ── Feedback Toggle ──────────────────── */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={feedbackEnabled}
                          onChange={(e) => setFeedbackEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-700 font-medium">添加课后反馈</span>
                      </label>

                      {feedbackEnabled && (
                        <div className="mt-3 space-y-4 pl-6">
                          {chapterFeedbacks.map((cf, ci) => (
                            <div
                              key={cf.chapterId}
                              className="border border-slate-100 rounded-lg p-3"
                            >
                              <p className="text-xs font-medium text-slate-600 mb-2">
                                {cf.chapterTitle}
                              </p>

                              {cf.questions.map((q, qi) => (
                                <div
                                  key={q.id}
                                  className="flex gap-2 items-start mb-2"
                                >
                                  <select
                                    value={q.type}
                                    onChange={(e) =>
                                      updateFeedbackQuestion(ci, qi, {
                                        type: e.target.value as FeedbackQuestionType,
                                      })
                                    }
                                    className="w-20 shrink-0 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                    {Object.entries(feedbackTypeLabels).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={q.prompt}
                                    onChange={(e) =>
                                      updateFeedbackQuestion(ci, qi, { prompt: e.target.value })
                                    }
                                    placeholder="问题内容"
                                    className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                                  {q.type === 'choice' && (
                                    <input
                                      type="text"
                                      value={q.options ?? ''}
                                      onChange={(e) =>
                                        updateFeedbackQuestion(ci, qi, { options: e.target.value })
                                      }
                                      placeholder="选项(逗号分隔)"
                                      className="w-40 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeFeedbackQuestion(ci, qi)}
                                    className="p-1 text-slate-400 hover:text-red-500"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => addFeedbackQuestion(ci)}
                                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 mt-1"
                              >
                                <Plus className="w-3 h-3" />
                                添加问题
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Homework Toggle ──────────────────── */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={homeworkEnabled}
                          onChange={(e) => setHomeworkEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-700 font-medium">添加课后作业</span>
                      </label>

                      {homeworkEnabled && (
                        <div className="mt-3 space-y-4 pl-6">
                          {chapterHomeworks.map((hw, hi) => (
                            <div
                              key={hw.chapterId}
                              className="border border-slate-100 rounded-lg p-3 space-y-2"
                            >
                              <p className="text-xs font-medium text-slate-600 mb-1">
                                {hw.chapterTitle}
                              </p>

                              <input
                                type="text"
                                value={hw.title}
                                onChange={(e) => updateHomework(hi, { title: e.target.value })}
                                placeholder="作业标题"
                                className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                              <textarea
                                value={hw.description}
                                onChange={(e) =>
                                  updateHomework(hi, { description: e.target.value })
                                }
                                placeholder="作业说明"
                                rows={2}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                              <div className="flex gap-2 items-center">
                                <label className="text-xs text-slate-500 shrink-0">题型:</label>
                                <select
                                  value={hw.questionType}
                                  onChange={(e) =>
                                    updateHomework(hi, {
                                      questionType: e.target.value as HomeworkQuestionType,
                                    })
                                  }
                                  className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                >
                                  {Object.entries(homeworkTypeLabels).map(([v, l]) => (
                                    <option key={v} value={v}>
                                      {l}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {(hw.questionType === 'single_choice' ||
                                hw.questionType === 'multi_choice') && (
                                <input
                                  type="text"
                                  value={hw.options}
                                  onChange={(e) =>
                                    updateHomework(hi, { options: e.target.value })
                                  }
                                  placeholder="选项(逗号分隔)"
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ─── Actions ──────────────────────────────────────── */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? '创建中...' : '创建课程实例'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
