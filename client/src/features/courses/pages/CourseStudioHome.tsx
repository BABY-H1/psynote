import React, { useState } from 'react';
import { BookOpen, Edit3, Eye, Sparkles, Trash2, Upload } from 'lucide-react';
import { useCourse, useCourses, useDeleteCourse } from '../../../api/useCourses';
import { AICourseCreator } from '../components/AICourseCreator';
import { CourseImporter } from './CourseImporter';
import { CourseRequirementsConfig } from './CourseRequirementsConfig';
import { CourseBlueprintEditor } from './CourseBlueprintEditor';
import { LessonEditor } from './LessonEditor';
import { PageLoading, useToast } from '../../../shared/components';

type ViewMode =
  | { type: 'list' }
  | { type: 'detail'; courseId: string }
  | { type: 'requirements'; courseId?: string }
  | { type: 'blueprint'; courseId: string }
  | { type: 'lesson'; courseId: string; chapterId: string }
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

  function openDetail(courseId: string) {
    setView({ type: 'detail', courseId });
  }

  function handleEditorBack(courseId?: string) {
    if (courseId) {
      openDetail(courseId);
    } else {
      setView({ type: 'list' });
    }
  }

  if (view.type === 'import') {
    return (
      <CourseImporter
        onClose={() => setView({ type: 'list' })}
        onCreated={(courseId) => setView({ type: 'blueprint', courseId })}
      />
    );
  }

  if (view.type === 'ai') {
    return (
      <AICourseCreator
        onClose={() => setView({ type: 'list' })}
        onCreated={(courseId) => setView({ type: 'blueprint', courseId })}
      />
    );
  }

  if (view.type === 'requirements') {
    return (
      <CourseRequirementsConfig
        courseId={view.courseId}
        onBack={() => handleEditorBack(view.courseId)}
        onGenerated={(courseId) => setView({ type: 'blueprint', courseId })}
      />
    );
  }

  if (view.type === 'blueprint') {
    return (
      <CourseBlueprintEditor
        courseId={view.courseId}
        onBack={() => openDetail(view.courseId)}
        onConfirmed={(courseId, chapterId) => {
          if (chapterId) {
            setView({ type: 'lesson', courseId, chapterId });
          } else {
            openDetail(courseId);
          }
        }}
      />
    );
  }

  if (view.type === 'lesson') {
    return (
      <LessonEditor
        courseId={view.courseId}
        chapterId={view.chapterId}
        onBack={() => openDetail(view.courseId)}
      />
    );
  }

  if (view.type === 'detail') {
    return (
      <CourseStudioDetail
        courseId={view.courseId}
        onBack={() => setView({ type: 'list' })}
        onEditBlueprint={(courseId) => setView({ type: 'blueprint', courseId })}
        onEditChapter={(chapterId) =>
          setView({ type: 'lesson', courseId: view.courseId, chapterId })
        }
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
                  </div>
                  {course.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{course.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => openDetail(course.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (course.status === 'draft') {
                        setView({ type: 'requirements', courseId: course.id });
                      } else if (course.status === 'blueprint') {
                        setView({ type: 'blueprint', courseId: course.id });
                      } else {
                        openDetail(course.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {course.orgId && (
                    <button
                      onClick={() => {
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
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseStudioDetail({
  courseId,
  onBack,
  onEditBlueprint,
  onEditChapter,
}: {
  courseId: string;
  onBack: () => void;
  onEditBlueprint?: (courseId: string) => void;
  onEditChapter?: (chapterId: string) => void;
}) {
  const { data: course } = useCourse(courseId);

  if (!course) return <PageLoading />;

  const canEditBlueprint = course.status === 'blueprint' || course.status === 'content_authoring';

  return (
    <div>
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-4">
        &larr; 返回课程工作室
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-slate-900">{course.title}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {STATUS_LABELS[course.status] || course.status}
            </span>
            {canEditBlueprint && onEditBlueprint && (
              <button
                onClick={() => onEditBlueprint(courseId)}
                className="text-xs text-brand-600 hover:underline"
              >
                编辑蓝图
              </button>
            )}
          </div>
        </div>
        {course.description && <p className="text-sm text-slate-600 mb-4">{course.description}</p>}
        <div className="flex gap-4 text-sm text-slate-500 flex-wrap">
          {course.courseType && <span>类型: {TYPE_LABELS[course.courseType] || course.courseType}</span>}
          {course.targetAudience && (
            <span>对象: {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}</span>
          )}
          {course.category && <span>分类: {course.category}</span>}
          {course.duration && <span>时长: {course.duration}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">课程章节 ({course.chapters?.length || 0})</h3>
        {!course.chapters || course.chapters.length === 0 ? (
          <p className="text-sm text-slate-400">还没有章节内容</p>
        ) : (
          <div className="space-y-3">
            {course.chapters.map((chapter, index) => (
              <div
                key={chapter.id}
                className="p-4 bg-slate-50 rounded-lg flex items-center justify-between"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900">
                    {index + 1}. {chapter.title}
                  </h4>
                  {chapter.sessionGoal && (
                    <p className="text-xs text-slate-500 mt-1">目标: {chapter.sessionGoal}</p>
                  )}
                  {chapter.content && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{chapter.content}</p>
                  )}
                </div>
                {(course.status === 'content_authoring' || course.status === 'published') && (
                  <button
                    onClick={() => onEditChapter?.(chapter.id)}
                    className="text-xs text-brand-600 hover:underline ml-4"
                  >
                    编辑内容
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
