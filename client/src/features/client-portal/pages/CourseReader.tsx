import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourse, useLessonBlocks, useUpdateCourseProgress } from '../../../api/useCourses';
import { LESSON_BLOCK_LABELS, LESSON_BLOCK_ORDER, type LessonBlockType } from '@psynote/shared';
import { PageLoading } from '../../../shared/components';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Circle,
  FileText,
  Video,
  Image,
  Download,
  BookOpen,
  Target,
  Lightbulb,
  Users,
  MessageSquare,
  PenTool,
  Star,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Block type icon mapping                                           */
/* ------------------------------------------------------------------ */

const blockIcons: Record<LessonBlockType, React.ElementType | null> = {
  objectives: Target,
  key_points: Star,
  preparation: FileText,
  warmup: Lightbulb,
  main_activity: BookOpen,
  experience: Users,
  sharing: MessageSquare,
  extension: PenTool,
  reflection: null, // hidden from students
};

/** Accent colour per block type for the left-border & icon tint */
const blockColors: Record<LessonBlockType, string> = {
  objectives: 'border-blue-400 text-blue-600 bg-blue-50',
  key_points: 'border-amber-400 text-amber-600 bg-amber-50',
  preparation: 'border-slate-400 text-slate-600 bg-slate-50',
  warmup: 'border-orange-400 text-orange-600 bg-orange-50',
  main_activity: 'border-indigo-400 text-indigo-600 bg-indigo-50',
  experience: 'border-emerald-400 text-emerald-600 bg-emerald-50',
  sharing: 'border-purple-400 text-purple-600 bg-purple-50',
  extension: 'border-cyan-400 text-cyan-600 bg-cyan-50',
  reflection: '',
};

/* ------------------------------------------------------------------ */
/*  Lesson blocks for AI-assisted chapters                            */
/* ------------------------------------------------------------------ */

function ChapterBlocks({ courseId, chapterId }: { courseId: string; chapterId: string }) {
  const { data: blocks, isLoading } = useLessonBlocks(courseId, chapterId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!blocks || blocks.length === 0) {
    return <p className="text-sm text-slate-400 italic">此章节尚未生成教案内容</p>;
  }

  // Sort by LESSON_BLOCK_ORDER
  const sorted = [...blocks].sort(
    (a, b) => LESSON_BLOCK_ORDER.indexOf(a.blockType) - LESSON_BLOCK_ORDER.indexOf(b.blockType),
  );

  return (
    <div className="space-y-5">
      {sorted.map((block) => {
        // reflection is teacher-only, hide from students
        if (block.blockType === 'reflection') return null;

        const Icon = blockIcons[block.blockType];
        const colorClasses = blockColors[block.blockType] || '';

        return (
          <section
            key={block.id}
            className={`border-l-4 rounded-r-lg pl-4 pr-4 py-4 ${colorClasses} transition-colors`}
          >
            <div className="flex items-center gap-2 mb-2">
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
              <h4 className="text-sm font-semibold">
                {LESSON_BLOCK_LABELS[block.blockType]}
              </h4>
            </div>
            {block.content ? (
              <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap text-slate-700">
                {block.content}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">暂无内容</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Manual chapter content                                            */
/* ------------------------------------------------------------------ */

function ManualChapterContent({ chapter }: { chapter: { content?: string; videoUrl?: string } }) {
  return (
    <>
      {chapter.videoUrl && (
        <div className="mb-6 rounded-lg overflow-hidden bg-black aspect-video">
          <video
            src={chapter.videoUrl}
            controls
            className="w-full h-full"
            controlsList="nodownload"
          >
            <track kind="captions" />
          </video>
        </div>
      )}

      {chapter.content ? (
        <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap">
          {chapter.content}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">此章节暂无内容</p>
      )}

      {/* TODO: Load chapter attachments from course_attachments API once the hook is available.
         For now, there's no useCourseAttachments hook, so attachments are not shown. */}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function CourseReader() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(courseId);
  const updateProgress = useUpdateCourseProgress();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // TODO: We need the enrollment record to track progress & mark chapters complete.
  // Currently the client-portal route doesn't provide enrollmentId via context.
  // Once an enrollment context/hook is available, wire it up here.
  const enrollmentId: string | null = null;
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
  const isAiAssisted = course.creationMode === 'ai_assisted';

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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } flex-shrink-0 transition-all duration-300 overflow-hidden border-r border-slate-200 bg-white`}
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
                  onClick={() => setSelectedChapterId(ch.id)}
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
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors lg:hidden"
            title={sidebarOpen ? '收起目录' : '展开目录'}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors hidden lg:block"
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

              {/* Content body */}
              <div className="mb-8">
                {isAiAssisted ? (
                  <ChapterBlocks courseId={course.id} chapterId={selectedChapter.id} />
                ) : (
                  <ManualChapterContent chapter={selectedChapter} />
                )}
              </div>

              {/* Homework suggestion (for both modes if present) */}
              {selectedChapter.homeworkSuggestion && (
                <div className="mb-8 p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex items-center gap-2 mb-1">
                    <PenTool className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700">课后练习</span>
                  </div>
                  <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">
                    {selectedChapter.homeworkSuggestion}
                  </p>
                </div>
              )}

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
