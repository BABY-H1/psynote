import React, { useState, useCallback } from 'react';
import { useCourses } from '../../../../api/useCourses';
import { useCreateCourseInstance } from '../../../../api/useCourseInstances';
import { useCreateFeedbackForm, useCreateHomeworkDef } from '../../../../api/useCourseInstances';
import { useAssessments } from '../../../../api/useAssessments';
import { useOrgMembers } from '../../../../api/useCounseling';
import { useToast } from '../../../../shared/components';
import { ArrowLeft, Save, Rocket } from 'lucide-react';
import { BeforePhase } from './BeforePhase';
import { DuringPhase } from './DuringPhase';
import { AfterPhase } from './AfterPhase';
import type { AssessmentConfig, Course, CoursePublishMode } from '@psynote/shared';

export interface ChapterFeedbackDraft {
  chapterId: string;
  chapterTitle: string;
  questions: Array<{ id: string; type: string; prompt: string; options?: string }>;
}

export interface ChapterHomeworkDraft {
  chapterId: string;
  chapterTitle: string;
  title: string;
  description: string;
  questionType: string;
  options: string;
}

export interface CourseWizardState {
  courseId: string;
  title: string;
  description: string;
  locationType: 'offline' | 'online';
  location: string;
  meetingLink: string;
  meetingPlatform: string;
  startDate: string;
  schedule: string;
  capacity: number;
  publishMode: CoursePublishMode;
  targetGroupLabel: string;
  selectedMemberIds: string[];
  csvMembers: Array<{ name: string; email?: string; phone?: string }>;
  assessmentConfig: AssessmentConfig;
  feedbackEnabled: boolean;
  chapterFeedbacks: ChapterFeedbackDraft[];
  homeworkEnabled: boolean;
  chapterHomeworks: ChapterHomeworkDraft[];
}

const INITIAL_STATE: CourseWizardState = {
  courseId: '',
  title: '',
  description: '',
  locationType: 'offline',
  location: '',
  meetingLink: '',
  meetingPlatform: '',
  startDate: '',
  schedule: '',
  capacity: 0,
  publishMode: 'assign',
  targetGroupLabel: '',
  selectedMemberIds: [],
  csvMembers: [],
  assessmentConfig: {},
  feedbackEnabled: false,
  chapterFeedbacks: [],
  homeworkEnabled: false,
  chapterHomeworks: [],
};

type Phase = 'before' | 'during' | 'after';

const PHASES: { key: Phase; label: string; emoji: string }[] = [
  { key: 'before', label: '开始前', emoji: '🟡' },
  { key: 'during', label: '进行中', emoji: '🟢' },
  { key: 'after', label: '结束后', emoji: '🔵' },
];

interface Props {
  onClose: () => void;
}

export function CourseWizard({ onClose }: Props) {
  const [state, setState] = useState<CourseWizardState>(INITIAL_STATE);
  const [activePhase, setActivePhase] = useState<Phase>('before');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: courses } = useCourses({ status: 'published' });
  const { data: assessments } = useAssessments();
  const { data: members } = useOrgMembers();
  const createInstance = useCreateCourseInstance();
  const createFeedback = useCreateFeedbackForm();
  const createHomework = useCreateHomeworkDef();
  const { toast } = useToast();

  const activeAssessments = assessments?.filter((a: any) => a.status !== 'archived') || [];
  const clients = (members || []).filter((m) => m.role === 'client');
  const selectedCourse = courses?.find((c) => c.id === state.courseId) || null;

  const updateState = useCallback((patch: Partial<CourseWizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCourseSelect = useCallback((courseId: string) => {
    const course = courses?.find((c) => c.id === courseId);
    if (!course) return;

    // Init chapter feedback/homework drafts
    const chapters = course.chapters || [];
    const feedbacks: ChapterFeedbackDraft[] = chapters.map((ch) => ({
      chapterId: ch.id,
      chapterTitle: ch.title,
      questions: [],
    }));
    const homeworks: ChapterHomeworkDraft[] = chapters.map((ch) => ({
      chapterId: ch.id,
      chapterTitle: ch.title,
      title: '',
      description: '',
      questionType: 'text',
      options: '',
    }));

    setState((prev) => ({
      ...prev,
      courseId,
      title: course.title || prev.title,
      description: course.description || prev.description,
      chapterFeedbacks: feedbacks,
      chapterHomeworks: homeworks,
      assessmentConfig: {},
    }));
  }, [courses]);

  const handleSubmit = async (status: 'draft' | 'active') => {
    if (!state.title.trim()) {
      toast('请填写课程标题', 'error');
      setActivePhase('before');
      return;
    }
    if (!state.courseId) {
      toast('请选择课程模板', 'error');
      setActivePhase('before');
      return;
    }

    setIsSubmitting(true);
    try {
      let locationStr = state.location || undefined;
      if (state.locationType === 'online') {
        const parts = [state.meetingPlatform, state.meetingLink].filter(Boolean);
        locationStr = parts.length > 0 ? `线上：${parts.join(' ')}` : '线上';
      }

      const instance = await createInstance.mutateAsync({
        courseId: state.courseId,
        title: state.title.trim(),
        description: state.description || undefined,
        publishMode: state.publishMode,
        status,
        capacity: state.publishMode === 'public' && state.capacity ? state.capacity : undefined,
        targetGroupLabel: state.publishMode === 'class' && state.targetGroupLabel.trim() ? state.targetGroupLabel.trim() : undefined,
        assessmentConfig: state.assessmentConfig,
        location: locationStr,
        startDate: state.startDate || undefined,
        schedule: state.schedule || undefined,
      });

      // Create feedback forms
      if (state.feedbackEnabled) {
        for (const cf of state.chapterFeedbacks) {
          const validQuestions = cf.questions.filter((q) => q.prompt.trim());
          if (validQuestions.length === 0) continue;
          try {
            await createFeedback.mutateAsync({
              instanceId: instance.id,
              chapterId: cf.chapterId,
              title: `${cf.chapterTitle} 课后反馈`,
              questions: validQuestions.map((q) => ({
                type: q.type,
                prompt: q.prompt,
                options: q.type === 'choice' && q.options ? q.options.split(',').map((o: string) => o.trim()) : undefined,
              })),
            });
          } catch { /* skip individual failures */ }
        }
      }

      // Create homework defs
      if (state.homeworkEnabled) {
        for (let i = 0; i < state.chapterHomeworks.length; i++) {
          const hw = state.chapterHomeworks[i];
          if (!hw.title.trim()) continue;
          try {
            await createHomework.mutateAsync({
              instanceId: instance.id,
              chapterId: hw.chapterId,
              title: hw.title,
              description: hw.description || undefined,
              questionType: hw.questionType,
              options: (hw.questionType === 'single_choice' || hw.questionType === 'multi_choice') && hw.options
                ? hw.options.split(',').map((o: string) => o.trim())
                : undefined,
              sortOrder: i,
            });
          } catch { /* skip */ }
        }
      }

      toast(status === 'draft' ? '草稿已保存' : '课程已发布', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message || '创建失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">创建课程实例</h2>
      </div>

      {/* Phase Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        {PHASES.map((phase) => (
          <button
            key={phase.key}
            onClick={() => setActivePhase(phase.key)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition ${
              activePhase === phase.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <span>{phase.emoji}</span>
            {phase.label}
          </button>
        ))}
      </div>

      {/* Phase Content */}
      <div className="mb-24">
        {activePhase === 'before' && (
          <BeforePhase
            state={state}
            onChange={updateState}
            courses={courses || []}
            selectedCourse={selectedCourse}
            onCourseSelect={handleCourseSelect}
            assessments={activeAssessments}
            clients={clients}
          />
        )}
        {activePhase === 'during' && (
          <DuringPhase
            state={state}
            onChange={updateState}
            selectedCourse={selectedCourse}
            assessments={activeAssessments}
          />
        )}
        {activePhase === 'after' && (
          <AfterPhase
            state={state}
            onChange={updateState}
            assessments={activeAssessments}
          />
        )}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-4 px-6 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {state.courseId ? (
              <span className="text-green-600">已选课程：{state.title || '未命名'}</span>
            ) : (
              <span className="text-amber-600">请先选择课程模板</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => handleSubmit('draft')}
              disabled={isSubmitting || !state.courseId || !state.title.trim()}
              className="px-5 py-2 border border-brand-200 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> 保存草稿
            </button>
            <button
              onClick={() => handleSubmit('active')}
              disabled={isSubmitting || !state.courseId || !state.title.trim()}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Rocket className="w-4 h-4" /> {isSubmitting ? '创建中...' : '立即发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
