import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCourses, useCourse, useDeleteCourse, usePublishCourse,
  useArchiveCourse, useCloneCourse, useUpdateCourse,
} from '../../../api/useCourses';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import type { Course, CourseStatus } from '@psynote/shared';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'blueprint', label: '蓝图' },
  { key: 'content_authoring', label: '编辑中' },
  { key: 'published', label: '已发布' },
  { key: 'archived', label: '已归档' },
  { key: 'template', label: '模板' },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-slate-100 text-slate-600' },
  blueprint: { label: '蓝图', cls: 'bg-blue-100 text-blue-700' },
  content_authoring: { label: '编辑中', cls: 'bg-amber-100 text-amber-700' },
  published: { label: '已发布', cls: 'bg-green-100 text-green-700' },
  archived: { label: '已归档', cls: 'bg-slate-100 text-slate-400' },
};

const TYPE_LABELS: Record<string, string> = {
  micro_course: '微课',
  series: '系列课',
  group_facilitation: '团辅',
  workshop: '工作坊',
};

const AUDIENCE_LABELS: Record<string, string> = {
  parent: '家长',
  student: '学生',
  counselor: '咨询师',
  teacher: '教师',
};

export function CourseCenter() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    status: tab === 'template' ? undefined : (tab === 'all' ? undefined : tab),
    isTemplate: tab === 'template' ? true : undefined,
    search: search || undefined,
  };
  const { data: courses, isLoading } = useCourses(filters);
  const deleteCourse = useDeleteCourse();
  const publishCourse = usePublishCourse();
  const archiveCourse = useArchiveCourse();
  const cloneCourse = useCloneCourse();
  const updateCourse = useUpdateCourse();
  const { toast } = useToast();

  if (selectedId) {
    return <CourseDetail courseId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">课程中心</h2>
          <p className="text-sm text-slate-500 mt-1">管理课程项目、AI创作与模板</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/courses/new/requirements')}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
          >
            + 新建课程项目
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          placeholder="搜索课程..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Course grid */}
      {isLoading ? (
        <PageLoading />
      ) : !courses || courses.length === 0 ? (
        <EmptyState
          title="暂无课程项目"
          action={{ label: '创建第一个课程', onClick: () => navigate('/courses/new/requirements') }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onView={() => setSelectedId(course.id)}
              onEdit={() => {
                if (course.status === 'draft') {
                  navigate(`/courses/${course.id}/requirements`);
                } else if (course.status === 'blueprint') {
                  navigate(`/courses/${course.id}/blueprint`);
                } else {
                  setSelectedId(course.id);
                }
              }}
              onPublish={() => publishCourse.mutate(course.id, { onSuccess: () => toast('课程已发布', 'success') })}
              onArchive={() => archiveCourse.mutate(course.id, { onSuccess: () => toast('课程已归档', 'success') })}
              onClone={() => cloneCourse.mutate(course.id, { onSuccess: () => toast('课程已克隆', 'success') })}
              onDelete={() => {
                if (confirm('确定删除此课程项目？')) deleteCourse.mutate(course.id, { onSuccess: () => toast('课程已删除', 'success') });
              }}
              onSaveAsTemplate={() => updateCourse.mutate({ courseId: course.id, isTemplate: true })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  onView,
  onEdit,
  onPublish,
  onArchive,
  onClone,
  onDelete,
  onSaveAsTemplate,
}: {
  course: Course;
  onView: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onClone: () => void;
  onDelete: () => void;
  onSaveAsTemplate: () => void;
}) {
  const badge = STATUS_BADGE[course.status] || STATUS_BADGE.draft;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition">
      <div className="p-4">
        {/* Title + badges */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 flex-1">
            {course.title}
          </h3>
          <div className="flex gap-1 ml-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            {course.isTemplate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">模板</span>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-3">
          {course.courseType && <span>{TYPE_LABELS[course.courseType] || course.courseType}</span>}
          {course.targetAudience && <span>· {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}</span>}
          {course.category && <span>· {course.category}</span>}
        </div>

        {course.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{course.description}</p>
        )}

        {/* Tags */}
        {course.tags && (course.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(course.tags as string[]).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {/* Updated time */}
        <div className="text-xs text-slate-300 mb-3">
          更新于 {new Date(course.updatedAt).toLocaleDateString('zh-CN')}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button onClick={onView} className="text-xs text-brand-600 hover:underline">查看</button>
          <button onClick={onEdit} className="text-xs text-brand-600 hover:underline">编辑</button>
          {course.status === 'content_authoring' && (
            <button onClick={onPublish} className="text-xs text-green-600 hover:underline">发布</button>
          )}
          {course.status === 'published' && (
            <button onClick={onArchive} className="text-xs text-slate-500 hover:underline">归档</button>
          )}
          <button onClick={onClone} className="text-xs text-slate-500 hover:underline">克隆</button>
          {!course.isTemplate && course.status !== 'draft' && (
            <button onClick={onSaveAsTemplate} className="text-xs text-purple-600 hover:underline">存为模板</button>
          )}
          {course.orgId && (
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">删除</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseDetail({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const { data: course } = useCourse(courseId);
  const navigate = useNavigate();

  if (!course) return <PageLoading />;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-4">
        &larr; 返回列表
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-slate-900">{course.title}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${(STATUS_BADGE[course.status] || STATUS_BADGE.draft).cls}`}>
            {(STATUS_BADGE[course.status] || STATUS_BADGE.draft).label}
          </span>
        </div>
        {course.description && <p className="text-sm text-slate-600 mb-4">{course.description}</p>}
        <div className="flex gap-4 text-sm text-slate-500">
          {course.courseType && <span>类型: {TYPE_LABELS[course.courseType] || course.courseType}</span>}
          {course.targetAudience && <span>对象: {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}</span>}
          {course.category && <span>分类: {course.category}</span>}
          {course.duration && <span>时长: {course.duration}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">章节 ({course.chapters?.length || 0})</h3>
        {(!course.chapters || course.chapters.length === 0) ? (
          <p className="text-sm text-slate-400">暂无章节</p>
        ) : (
          <div className="space-y-3">
            {course.chapters.map((ch, idx) => (
              <div key={ch.id} className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900">
                    {idx + 1}. {ch.title}
                  </h4>
                  {ch.sessionGoal && (
                    <p className="text-xs text-slate-500 mt-1">目标: {ch.sessionGoal}</p>
                  )}
                  {ch.content && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ch.content}</p>
                  )}
                </div>
                {(course.status === 'content_authoring' || course.status === 'published') && (
                  <button
                    onClick={() => navigate(`/courses/${courseId}/chapters/${ch.id}/edit`)}
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
