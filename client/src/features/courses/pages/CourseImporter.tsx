import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Sparkles, Upload } from 'lucide-react';
import type { CourseType, TargetAudience } from '@psynote/shared';
import { useCreateCourse } from '../../../api/useCourses';
import { useExtractCourse, type ExtractedCourseDraft } from '../../../api/useCourseAuthoring';
import { useToast } from '../../../shared/components';

interface Props {
  onClose: () => void;
  onCreated: (courseId: string) => void;
}

const COURSE_TYPE_LABELS: Record<string, string> = {
  micro_course: '微课',
  series: '系列课',
  group_facilitation: '团辅课程',
  workshop: '工作坊',
};

const AUDIENCE_LABELS: Record<string, string> = {
  parent: '家长',
  student: '学生',
  counselor: '咨询师',
  teacher: '教师',
};

export function CourseImporter({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const extractCourse = useExtractCourse();
  const createCourse = useCreateCourse();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ExtractedCourseDraft | null>(null);

  function handleExtract() {
    if (!text.trim()) return;
    extractCourse.mutate(
      { content: text },
      {
        onSuccess: (data) => setResult(data),
        onError: (error) =>
          toast(error instanceof Error ? error.message : '识别失败，请检查文本内容后重试', 'error'),
      },
    );
  }

  async function handleSave() {
    if (!result) return;
    try {
      const created = await createCourse.mutateAsync({
        title: result.title,
        description: result.description,
        category: result.category,
        courseType: result.courseType as CourseType | undefined,
        targetAudience: result.targetAudience as TargetAudience | undefined,
        creationMode: 'ai_assisted',
        status: 'blueprint',
        requirementsConfig: result.requirements,
        blueprintData: result.blueprint,
      });
      toast('课程草稿已导入，正在进入蓝图编辑', 'success');
      onCreated(created.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存失败，请重试', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Upload className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">文本导入课程</h3>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">粘贴课程文本，AI 会自动识别结构</p>
            <p className="text-amber-600">
              支持：教学大纲、心理健康课程方案、工作坊计划、讲义等
            </p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="在此粘贴课程文本..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex justify-end">
            <button
              onClick={handleExtract}
              disabled={!text.trim() || extractCourse.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              {extractCourse.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> 开始识别
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <BookOpen className="w-4 h-4" />
              <span className="text-sm font-semibold">识别完成，请确认</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div>
                <span className="text-xs text-slate-400">标题</span>
                <p className="text-sm font-semibold text-slate-900">{result.title}</p>
              </div>
              {result.description && (
                <div>
                  <span className="text-xs text-slate-400">简介</span>
                  <p className="text-sm text-slate-700">{result.description}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs pt-1">
                {result.courseType && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    {COURSE_TYPE_LABELS[result.courseType] || result.courseType}
                  </span>
                )}
                {result.targetAudience && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                    {AUDIENCE_LABELS[result.targetAudience] || result.targetAudience}
                  </span>
                )}
                {result.category && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {result.category}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {result.blueprint.sessions.length} 节
                </span>
              </div>
            </div>

            {result.blueprint.sessions.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">节次预览</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {result.blueprint.sessions.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start text-sm text-slate-600">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <span className="font-medium">{s.title}</span>
                        {s.goal && <span className="text-xs text-slate-400 ml-2">{s.goal}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-slate-400">
              下一步会进入蓝图编辑，你可以继续细调每一节的结构和内容。
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              重新识别
            </button>
            <button
              onClick={handleSave}
              disabled={createCourse.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {createCourse.isPending ? '保存中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
