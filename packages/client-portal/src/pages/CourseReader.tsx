import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCourse, useUpdateCourseProgress } from '@client/api/useCourses';
import { PageLoading } from '@client/shared/components';
// Phase 9α — C-facing content block renderer
import { ContentBlockRenderer } from '../components/ContentBlockRenderer';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Circle,
  BookOpen,
  Target,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Block type icon mapping                                           */
/* ------------------------------------------------------------------ */

/* Lesson plan blocks (ChapterBlocks) and manual chapter content (ManualChapterContent)
   are NOT rendered in the portal — they are the counselor's teaching notes. The portal
   only shows ContentBlockRenderer (actual consumable content like video/audio/worksheets)
   and the chapter header (title + session goal) + homework suggestion. */

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

/**
 * Phase 8c — CourseReader now accepts the enrollmentId via route state.
 *
 * MyServicesTab navigates with `navigate('/portal/services/course/:courseId',
 * { state: { enrollmentId } })`, and we read it here via useLocation().
 * This replaces the Phase 8a hardcoded `null` which broke progress tracking.
 *
 * Fallback: if the route state is missing (e.g. direct URL access, or the
 * caller forgot to pass state), progress mutations are silently no-ops —
 * the buttons still render but the user just navigates away without
 * mutations firing. This matches pre-Phase-8c behavior.
 */
export function CourseReader() {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(courseId);
  const updateProgress = useUpdateCourseProgress();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  // Mobile-first: sidebar closed by default on small screens
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  // Phase 8c bug fix — enrollmentId comes from route state (set by MyServicesTab
  // when the user drills down from "我的课程"). Missing state → null, which
  // silently no-ops the progress mutations below (pre-Phase-8c behavior).
  const routeState = (location.state as { enrollmentId?: string | null } | null) ?? null;
  const enrollmentId: string | null = routeState?.enrollmentId ?? null;
  const completedChapters: Record<string, boolean> = {};

  const chapters = course?.chapters?.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  // Auto-select first chapter
  useEffect(() => {
    if (chapters.length > 0 && !selectedChapterId) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId]);

  if (isLoading) return <PageLoading />;

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BookOpen className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-slate-500 mb-4">课程未找到</p>
        <button
          onClick={() => navigate('/portal/services')}
          className="text-brand-600 text-sm hover:underline"
        >
          返回服务大厅
        </button>
      </div>
    );
  }

  const currentIdx = chapters.findIndex((ch) => ch.id === selectedChapterId);
  const selectedChapter = currentIdx >= 0 ? chapters[currentIdx] : chapters[0];
  const isFirst = currentIdx <= 0;
  const isLast = currentIdx >= chapters.length - 1;

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < chapters.length) {
      setSelectedChapterId(chapters[idx].id);
      // Scroll content to top
      document.getElementById('chapter-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCompleteChapter = () => {
    if (!enrollmentId || !selectedChapter) return;
    updateProgress.mutate({
      enrollmentId,
      chapterId: selectedChapter.id,
      completed: true,
    });
  };

  const handleCompleteCourse = () => {
    // Complete last chapter then navigate back
    if (enrollmentId && selectedChapter) {
      updateProgress.mutate(
        { enrollmentId, chapterId: selectedChapter.id, completed: true },
        { onSuccess: () => navigate('/portal/services') },
      );
    } else {
      navigate('/portal/services');
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* ── Backdrop (mobile only) ───────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${
          sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-64 md:translate-x-0'
        } absolute md:relative inset-y-0 left-0 z-30 md:z-auto flex-shrink-0 transition-all duration-300 overflow-hidden border-r border-slate-200 bg-white`}
      >
        <div className="flex flex-col h-full w-64">
          {/* Course title */}
          <div className="px-4 py-4 border-b border-slate-100">
            <button
              onClick={() => navigate('/portal/services')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-2 transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
              返回服务大厅
            </button>
            <h2 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2">
              {course.title}
            </h2>
            {chapters.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                共 {chapters.length} 章节
              </p>
            )}
          </div>

          {/* Chapter list */}
          <nav className="flex-1 overflow-y-auto py-2">
            {chapters.map((ch, idx) => {
              const isSelected = selectedChapter?.id === ch.id;
              const isCompleted = completedChapters[ch.id];

              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    setSelectedChapterId(ch.id);
                    // Auto-close sidebar on mobile after selection
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors group ${
                    isSelected
                      ? 'bg-brand-50 border-r-2 border-brand-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Progress indicator */}
                  <span className="flex-shrink-0 mt-0.5">
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : isSelected ? (
                      <div className="w-4 h-4 rounded-full border-2 border-brand-500 bg-brand-100" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300" />
                    )}
                  </span>

                  <span className="min-w-0">
                    <span
                      className={`block text-xs leading-tight ${
                        isSelected
                          ? 'font-semibold text-brand-700'
                          : isCompleted
                            ? 'text-slate-500'
                            : 'text-slate-600 group-hover:text-slate-800'
                      }`}
                    >
                      <span className="text-slate-400 mr-1">{idx + 1}.</span>
                      {ch.title}
                    </span>
                    {ch.duration && (
                      <span className="text-[10px] text-slate-400 mt-0.5 block">{ch.duration}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Right content area ───────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar with sidebar toggle */}
        <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title={sidebarOpen ? '收起目录' : '展开目录'}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {selectedChapter && (
            <div className="flex-1 min-w-0">
              <span className="text-xs text-slate-400">
                第 {currentIdx + 1} / {chapters.length} 章
              </span>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div id="chapter-content" className="flex-1 overflow-y-auto">
          {selectedChapter ? (
            <div className="max-w-3xl mx-auto px-6 py-8">
              {/* Chapter header */}
              <header className="mb-8">
                <span className="text-xs font-medium text-brand-500 uppercase tracking-wide">
                  第 {currentIdx + 1} 章
                </span>
                <h1 className="text-2xl font-bold text-slate-900 mt-1 leading-snug">
                  {selectedChapter.title}
                </h1>

                {selectedChapter.sessionGoal && (
                  <div className="mt-4 flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-blue-600 block mb-0.5">
                        本节目标
                      </span>
                      <p className="text-sm text-blue-800 leading-relaxed">
                        {selectedChapter.sessionGoal}
                      </p>
                    </div>
                  </div>
                )}
              </header>

              {/* Phase 9α — C-facing content blocks (video / audio / reflection / quiz / ...) */}
              {/* Lesson plan blocks (ChapterBlocks / ManualChapterContent) are intentionally
                  NOT rendered here — those are the counselor's teaching notes, not student
                  learning content. The ContentBlockRenderer shows actual consumable content
                  (video, audio, worksheets, quizzes) that the counselor has published for
                  the chapter. If none exist yet, it shows "本节暂无可消费的内容". */}
              <div className="mb-8">
                <ContentBlockRenderer
                  parentType="course"
                  parentId={selectedChapter.id}
                  enrollmentId={enrollmentId || ''}
                  enrollmentType="course"
                />
              </div>

              {/* homeworkSuggestion is part of the counselor's lesson plan (AI-suggested
                 homework for the teacher to assign). Actual student homework is delivered
                 via content blocks (worksheet / reflection types) in ContentBlockRenderer. */}

              {/* ── Progress controls ─────────────────────────────── */}
              <footer className="flex items-center justify-between pt-6 mt-8 border-t border-slate-200">
                {/* Previous */}
                <button
                  onClick={() => goTo(currentIdx - 1)}
                  disabled={isFirst}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isFirst
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一章
                </button>

                {/* Center: Complete chapter */}
                <button
                  onClick={isLast ? handleCompleteCourse : handleCompleteChapter}
                  disabled={updateProgress.isPending}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isLast
                      ? 'bg-green-600 text-white hover:bg-green-500 disabled:opacity-50'
                      : 'bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50'
                  }`}
                >
                  {updateProgress.isPending
                    ? '保存中...'
                    : isLast
                      ? '完成课程'
                      : '完成本章'}
                </button>

                {/* Next */}
                <button
                  onClick={() => goTo(currentIdx + 1)}
                  disabled={isLast}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isLast
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  下一章
                  <ChevronRight className="w-4 h-4" />
                </button>
              </footer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <BookOpen className="w-10 h-10 mb-3" />
              <p className="text-sm">请从左侧目录选择章节</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
