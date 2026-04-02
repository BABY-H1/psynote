import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourse, useUpdateCourseProgress } from '../../../api/useCourses';
import { useAuthStore } from '../../../stores/authStore';
import { PageLoading, EmptyState } from '../../../shared/components';

export function CourseReader() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(courseId);
  const updateProgress = useUpdateCourseProgress();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  if (isLoading) {
    return <PageLoading />;
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-4">课程未找到</p>
        <button onClick={() => navigate('/portal/services')} className="text-brand-600 text-sm hover:underline">
          返回服务大厅
        </button>
      </div>
    );
  }

  const chapters = course.chapters || [];
  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId) || chapters[0];

  // Calculate progress (we don't have enrollment data directly, just show chapters)
  const totalChapters = chapters.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/portal/services')}
          className="text-sm text-slate-500 hover:text-slate-700 mb-3 inline-block"
        >
          &larr; 返回服务大厅
        </button>
        <h2 className="text-xl font-bold text-slate-900">{course.title}</h2>
        {course.description && (
          <p className="text-sm text-slate-500 mt-1">{course.description}</p>
        )}
        <div className="flex gap-3 text-xs text-slate-400 mt-2">
          {course.category && <span>{course.category}</span>}
          {course.duration && <span>· {course.duration}</span>}
          <span>· {totalChapters} 章节</span>
        </div>
      </div>

      {chapters.length === 0 ? (
        <EmptyState title="暂无课程内容" />
      ) : (
        <div className="flex gap-6">
          {/* Chapter sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">章节目录</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {chapters.map((ch, idx) => (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChapterId(ch.id)}
                    className={`w-full text-left px-4 py-3 text-sm transition hover:bg-slate-50 ${
                      (selectedChapter?.id === ch.id)
                        ? 'bg-brand-50 border-l-2 border-brand-500 text-brand-700 font-medium'
                        : 'text-slate-600'
                    }`}
                  >
                    <span className="text-slate-400 mr-2">{idx + 1}.</span>
                    {ch.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 min-w-0">
            {selectedChapter && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{selectedChapter.title}</h3>

                {selectedChapter.sessionGoal && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <span className="text-xs font-medium text-blue-600">本节目标</span>
                    <p className="text-sm text-blue-800 mt-1">{selectedChapter.sessionGoal}</p>
                  </div>
                )}

                {selectedChapter.content ? (
                  <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap">
                    {selectedChapter.content}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">此章节暂无内容</p>
                )}

                {selectedChapter.homeworkSuggestion && (
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <span className="text-xs font-medium text-amber-600">课后练习</span>
                    <p className="text-sm text-amber-800 mt-1">{selectedChapter.homeworkSuggestion}</p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-100">
                  {chapters.indexOf(selectedChapter) > 0 ? (
                    <button
                      onClick={() => setSelectedChapterId(chapters[chapters.indexOf(selectedChapter) - 1].id)}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      &larr; 上一节
                    </button>
                  ) : <div />}

                  {chapters.indexOf(selectedChapter) < chapters.length - 1 ? (
                    <button
                      onClick={() => setSelectedChapterId(chapters[chapters.indexOf(selectedChapter) + 1].id)}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500"
                    >
                      下一节 &rarr;
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/portal/services')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500"
                    >
                      完成课程
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
