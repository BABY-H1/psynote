import { useEffect, useState } from 'react';
import { LESSON_BLOCK_LABELS } from '@psynote/shared';
import {
  useCourse,
  useUpdateCourse,
  useDeleteCourse,
  useConfirmBlueprint,
  useLessonBlocks,
  useUpsertLessonBlocks,
} from '../../../api/useCourses';
import { PageLoading, useToast } from '../../../shared/components';
import { ChapterDetailView } from './course-detail/ChapterDetailView';
import { CourseDetailSidebar } from './course-detail/CourseDetailSidebar';
import { CourseDetailTopBar } from './course-detail/CourseDetailTopBar';
import { OverviewPanel } from './course-detail/OverviewPanel';
import { makeEditState, runSavePipeline } from './course-detail/courseEditState';
import type { BlockGroupKey, EditState } from './course-detail/types';
import { useCourseEditState } from './course-detail/useCourseEditState';

interface Props {
  courseId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

/**
 * Course editor — top-level orchestrator. Delegates per-tab rendering,
 * mutable state + updaters, AI chat, and the tab+actions bar to files
 * under ./course-detail/. What stays here: the read/edit switch, the
 * 3-phase save via `runSavePipeline`, delete-with-confirm, and the
 * derived `displayData` every sub-panel reads from.
 */
export function CourseDetail({ courseId, onBack, initialEditing = false }: Props) {
  const { data: course, isLoading } = useCourse(courseId);
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const confirmBlueprint = useConfirmBlueprint();
  const upsertBlocks = useUpsertLessonBlocks();
  const { toast } = useToast();

  const state = useCourseEditState();
  const [editing, setEditing] = useState(initialEditing);
  const [activeTab, setActiveTab] = useState<'overview' | number>('overview');
  const [activeBlockGroup, setActiveBlockGroup] = useState<BlockGroupKey>('prep');

  const chapters = course?.chapters || [];
  const activeChapterId = activeTab === 'overview' ? undefined : chapters[activeTab]?.id;
  const { data: activeChapterBlocks } = useLessonBlocks(courseId, activeChapterId);

  // Stash per-chapter blocks as the user navigates, so the edit snapshot
  // captures everything they've visited (not just the currently-active).
  const [chapterBlocksCache, setChapterBlocksCache] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (activeChapterId && activeChapterBlocks) {
      setChapterBlocksCache((prev) => ({ ...prev, [activeChapterId]: activeChapterBlocks }));
    }
  }, [activeChapterId, activeChapterBlocks]);

  const handleEdit = () => {
    if (!course) return;
    state.setEditData(makeEditState(course, chapterBlocksCache));
    setEditing(true);
  };

  useEffect(() => {
    if (initialEditing && course && !state.editData) {
      state.setEditData(makeEditState(course, chapterBlocksCache));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, course]);

  const handleCancel = () => {
    setEditing(false);
    state.setEditData(null);
  };

  const handleSave = async () => {
    const editData = state.editData;
    if (!editData || !course) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      await runSavePipeline({
        courseId,
        editData,
        currentStatus: course.status,
        updateCourse: updateCourse.mutateAsync,
        confirmBlueprint: confirmBlueprint.mutateAsync,
        upsertBlocks: upsertBlocks.mutateAsync,
      });
      toast('课程已保存', 'success');
      setEditing(false);
      state.setEditData(null);
    } catch (err) {
      console.error('保存课程失败:', err);
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!course) return;
    if (!confirm(`确定删除"${course.title}"？此操作不可恢复。`)) return;
    try {
      await deleteCourse.mutateAsync(courseId);
      toast('课程已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  if (isLoading || !course) return <PageLoading text="加载课程详情..." />;

  const displayData: EditState =
    editing && state.editData ? state.editData : makeEditState(course, chapterBlocksCache);
  const activeChapter = activeTab === 'overview' ? null : chapters[activeTab];
  const activeSessionIndex = activeTab === 'overview' ? null : activeTab;
  const activeSession =
    activeSessionIndex !== null ? displayData.blueprint.sessions[activeSessionIndex] : null;

  return (
    <div className="flex flex-row-reverse h-full overflow-hidden">
      {/* RIGHT (rendered first; flex-row-reverse places it on the right) */}
      <CourseDetailSidebar
        title={displayData.title}
        onBack={onBack}
        editing={editing}
        blueprint={displayData.blueprint}
        activeTab={activeTab}
        activeBlockGroup={activeBlockGroup}
        activeChapterId={activeChapter?.id}
        chapterLessonBlocks={activeChapter ? displayData.lessonBlocks[activeChapter.id] || {} : {}}
        onApplyBlueprint={(bp) => {
          state.patchBlueprint(bp);
          toast('AI 已更新蓝图', 'success');
        }}
        onApplyLessonBlock={(chapterId, blockType, content) => {
          state.updateLessonBlock(chapterId, blockType, content);
          toast(`AI 已更新「${LESSON_BLOCK_LABELS[blockType]}」`, 'success');
        }}
      />

      {/* LEFT: tabbed content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        <CourseDetailTopBar
          activeTab={activeTab}
          sessionCount={displayData.blueprint.sessions.length}
          onTabChange={setActiveTab}
          editing={editing}
          status={course.status}
          canDelete={!!course.orgId}
          isSaving={updateCourse.isPending || upsertBlocks.isPending}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onSave={handleSave}
          onDelete={handleDelete}
        />

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="max-w-3xl mx-auto p-6">
              <OverviewPanel
                editing={editing}
                title={displayData.title}
                description={displayData.description}
                blueprint={displayData.blueprint}
                onTitleChange={state.patchTitle}
                onDescriptionChange={state.patchDescription}
                onBlueprintChange={state.updateBlueprintField}
              />
            </div>
          ) : activeChapter && activeSession && activeSessionIndex !== null ? (
            <ChapterDetailView
              key={activeChapter.id}
              chapter={activeChapter}
              session={activeSession}
              sessionIndex={activeSessionIndex}
              editing={editing}
              activeBlockGroup={activeBlockGroup}
              onBlockGroupChange={setActiveBlockGroup}
              lessonBlocks={displayData.lessonBlocks[activeChapter.id] || {}}
              onUpdateSession={(field, value) =>
                state.updateSessionField(activeSessionIndex, field, value)
              }
              onUpdateBlock={(blockType, content) =>
                state.updateLessonBlock(activeChapter.id, blockType, content)
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              {course.status === 'blueprint' ? '蓝图保存后将自动生成章节' : '暂无章节'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
