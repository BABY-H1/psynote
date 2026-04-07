import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourses, useDeleteCourse } from '../../../api/useCourses';
import { PageLoading, useToast } from '../../../shared/components';
import { ManualCourseEditor } from '../../courses/pages/ManualCourseEditor';
import { BookOpen, Sparkles, Upload, Eye, Edit3, Trash2 } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  micro_course: '微课', series: '系列课', group_facilitation: '团辅', workshop: '工作坊',
};

const AUDIENCE_LABELS: Record<string, string> = {
  parent: '家长', student: '学生', counselor: '咨询师', teacher: '教师',
};

export function CoursesTab() {
  const navigate = useNavigate();
  const { data: courses, isLoading } = useCourses();
  const deleteCourse = useDeleteCourse();
  const { toast } = useToast();
  const [showManualEditor, setShowManualEditor] = useState(false);

  if (showManualEditor) {
    return <ManualCourseEditor onClose={() => setShowManualEditor(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          创作与管理课程方案模板，可用于心理健康教育
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowManualEditor(true)}
            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> 文本导入
          </button>
          <button
            onClick={() => navigate('/courses/new/requirements')}
            className="px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> AI 生成
          </button>
        </div>
      </div>

      {isLoading ? <PageLoading /> : !courses || courses.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          暂无课程方案，点击上方按钮创建
        </div>
      ) : (
        <div className="grid gap-3">
          {courses.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900">{c.title}</span>
                    {c.courseType && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                        {TYPE_LABELS[c.courseType] || c.courseType}
                      </span>
                    )}
                    {c.targetAudience && (
                      <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full">
                        {AUDIENCE_LABELS[c.targetAudience] || c.targetAudience}
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => {
                      if (c.status === 'draft') navigate(`/courses/${c.id}/requirements`);
                      else if (c.status === 'blueprint') navigate(`/courses/${c.id}/blueprint`);
                      else navigate(`/courses/${c.id}/blueprint`);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (c.status === 'draft') navigate(`/courses/${c.id}/requirements`);
                      else navigate(`/courses/${c.id}/blueprint`);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`确定删除"${c.title}"？`)) {
                        try { await deleteCourse.mutateAsync(c.id); toast('已删除', 'success'); }
                        catch { toast('删除失败', 'error'); }
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
