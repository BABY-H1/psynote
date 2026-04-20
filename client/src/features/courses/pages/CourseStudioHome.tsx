import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Edit3, Eye, Sparkles, Trash2, Upload } from 'lucide-react';
import { useCourses, useDeleteCourse } from '../../../api/useCourses';
import { AICourseCreator } from '../components/AICourseCreator';
import { CourseImporter } from './CourseImporter';
import { CourseDetail } from './CourseDetail';
import { PageLoading, useToast } from '../../../shared/components';
import { DistributionControl } from '../../../shared/components/DistributionControl';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';

type ViewMode =
  | { type: 'list' }
  | { type: 'detail'; courseId: string; editing: boolean }
  | { type: 'import' }
  | { type: 'ai' };

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  blueprint: '蓝图',
  content_authoring: '编辑中',
  published: '已发布',
  archived: '已归档',
};

const TYPE_LABELS: Record<string, string> = {
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

export function CourseStudioHome() {
  const { toast } = useToast();
  const { data: courses, isLoading } = useCourses();
  const deleteCourse = useDeleteCourse();
  const [view, setView] = useState<ViewMode>({ type: 'list' });
  const qc = useQueryClient();
  const isSystemScope = useIsSystemLibraryScope();

  if (view.type === 'import') {
    return (
      <CourseImporter
        onClose={() => setView({ type: 'list' })}
        onCreated={(courseId) => setView({ type: 'detail', courseId, editing: true })}
      />
    );
  }

  if (view.type === 'ai') {
    return (
      <AICourseCreator
        onClose={() => setView({ type: 'list' })}
        onCreated={(courseId) => setView({ type: 'detail', courseId, editing: true })}
      />
    );
  }

  if (view.type === 'detail') {
    return (
      <CourseDetail
        courseId={view.courseId}
        initialEditing={view.editing}
        onBack={() => setView({ type: 'list' })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理课程模板，发布后可用于课程中心开课
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView({ type: 'import' })}
            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> 文本导入
          </button>
          <button
            onClick={() => setView({ type: 'ai' })}
            className="px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> AI 生成
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : !courses || courses.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          暂无课程，点击上方按钮创建
        </div>
      ) : (
        <div className="grid gap-3">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {course.title}
                    </span>
                    {course.courseType && (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                        {TYPE_LABELS[course.courseType] || course.courseType}
                      </span>
                    )}
                    {course.targetAudience && (
                      <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full">
                        {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                      {STATUS_LABELS[course.status] || course.status}
                    </span>
                    {course.isTemplate && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                        模板
                      </span>
                    )}
                    <DistributionControl
                      resource="courses"
                      item={course}
                      onSaved={() => qc.invalidateQueries({ queryKey: ['courses'] })}
                    />
                  </div>
                  {course.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{course.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() =>
                      setView({ type: 'detail', courseId: course.id, editing: false })
                    }
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!course.orgId && !isSystemScope) {
                        toast('无权修改：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      setView({ type: 'detail', courseId: course.id, editing: true });
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!course.orgId && !isSystemScope) {
                        toast('无权删除：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      if (confirm(`确定删除"${course.title}"？此操作不可恢复。`)) {
                        deleteCourse.mutate(course.id, {
                          onSuccess: () => toast('课程已删除', 'success'),
                          onError: (error) => toast(error.message || '删除失败', 'error'),
                        });
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
