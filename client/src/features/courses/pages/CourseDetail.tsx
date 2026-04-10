import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, Sparkles, Send, Loader2,
} from 'lucide-react';
import {
  LESSON_BLOCK_LABELS,
  LESSON_BLOCK_ORDER,
  type CourseBlueprintData,
  type CourseBlueprintSession,
  type LessonBlockType,
} from '@psynote/shared';
import {
  useCourse,
  useUpdateCourse,
  useDeleteCourse,
  useConfirmBlueprint,
  useLessonBlocks,
  useUpsertLessonBlocks,
} from '../../../api/useCourses';
import {
  useRefineCourseBlueprint,
  useRefineLessonBlock,
} from '../../../api/useCourseAuthoring';
import { PageLoading, useToast } from '../../../shared/components';
// Phase 9α — C-facing content blocks for learner consumption
import { ContentBlockPanel } from '../../knowledge/components/ContentBlockPanel';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  blueprint: '蓝图',
  content_authoring: '编辑中',
  published: '已发布',
  archived: '已归档',
};

// Lesson blocks grouped into 3 sub-tabs
const BLOCK_GROUPS: { key: 'prep' | 'class' | 'extension'; label: string; blocks: LessonBlockType[] }[] = [
  { key: 'prep', label: '教学准备', blocks: ['objectives', 'key_points', 'preparation'] },
  { key: 'class', label: '课堂活动', blocks: ['warmup', 'main_activity', 'experience', 'sharing'] },
  { key: 'extension', label: '课后延伸', blocks: ['extension', 'reflection'] },
];

interface Props {
  courseId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

interface EmptyBlueprint extends CourseBlueprintData {
  // marker
}

function emptyBlueprint(title = ''): EmptyBlueprint {
  return {
    courseName: title,
    positioning: '',
    targetDescription: '',
    boundaries: '',
    goals: [],
    referralAdvice: '',
    sessions: [],
  };
}

// Local mutable shape for the editor — keep blueprint + per-chapter lesson blocks
interface EditState {
  title: string;
  description: string;
  blueprint: CourseBlueprintData;
  // chapterId → blockType → content
  lessonBlocks: Record<string, Record<string, string>>;
}

function makeEditState(course: any, chapterBlocks: Record<string, any[]>): EditState {
  const blueprint: CourseBlueprintData =
    course.blueprintData ?? emptyBlueprint(course.title || '');

  // Materialize lessonBlocks per chapter
  const lessonBlocks: Record<string, Record<string, string>> = {};
  for (const chapter of course.chapters || []) {
    const blocks = chapterBlocks[chapter.id] || [];
    const map: Record<string, string> = {};
    for (const bt of LESSON_BLOCK_ORDER) {
      const existing = blocks.find((b: any) => b.blockType === bt);
      map[bt] = existing?.content || '';
    }
    lessonBlocks[chapter.id] = map;
  }

  return {
    title: course.title || '',
    description: course.description || '',
    blueprint: structuredClone(blueprint),
    lessonBlocks,
  };
}

export function CourseDetail({ courseId, onBack, initialEditing = false }: Props) {
  const { data: course, isLoading } = useCourse(courseId);
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const confirmBlueprint = useConfirmBlueprint();
  const upsertBlocks = useUpsertLessonBlocks();
  const { toast } = useToast();

  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditState | null>(null);
  // 'overview' or numeric chapter index
  const [activeTab, setActiveTab] = useState<'overview' | number>('overview');
  // Sub-tab inside chapter view
  const [activeBlockGroup, setActiveBlockGroup] = useState<'prep' | 'class' | 'extension'>('prep');

  // Per-chapter lesson blocks (load only the ones needed)
  // We pre-load blocks for the active chapter
  const chapters = course?.chapters || [];
  const activeChapterId =
    activeTab === 'overview' ? undefined : chapters[activeTab]?.id;
  const { data: activeChapterBlocks } = useLessonBlocks(courseId, activeChapterId);

  // Stash chapter blocks as we visit them
  const [chapterBlocksCache, setChapterBlocksCache] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (activeChapterId && activeChapterBlocks) {
      setChapterBlocksCache((prev) => ({ ...prev, [activeChapterId]: activeChapterBlocks }));
    }
  }, [activeChapterId, activeChapterBlocks]);

  // When editing starts, snapshot the current data
  const handleEdit = useCallback(() => {
    if (!course) return;
    setEditData(makeEditState(course, chapterBlocksCache));
    setEditing(true);
  }, [course, chapterBlocksCache]);

  // Auto-enter edit mode if requested
  useEffect(() => {
    if (initialEditing && course && !editData) {
      setEditData(makeEditState(course, chapterBlocksCache));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, course]);

  const handleCancel = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editData || !course) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      // 1. Save course-level fields + blueprint
      await updateCourse.mutateAsync({
        courseId,
        title: editData.title,
        description: editData.description,
        blueprintData: editData.blueprint,
      });

      // 2. If course is still in 'blueprint' state and we have sessions,
      //    confirm the blueprint to materialize chapters
      if (course.status === 'blueprint' && editData.blueprint.sessions.length > 0) {
        await confirmBlueprint.mutateAsync({
          courseId,
          sessions: editData.blueprint.sessions,
        });
      }

      // 3. Save lesson blocks for each chapter we touched
      for (const [chapterId, blockMap] of Object.entries(editData.lessonBlocks)) {
        const blocks = LESSON_BLOCK_ORDER.map((bt, i) => ({
          blockType: bt,
          content: blockMap[bt] || undefined,
          sortOrder: i,
        }));
        await upsertBlocks.mutateAsync({ courseId, chapterId, blocks });
      }

      toast('课程已保存', 'success');
      setEditing(false);
      setEditData(null);
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

  // ─── Field updaters ────────────────────────────────────────────

  const updateBlueprintField = useCallback(
    <K extends keyof CourseBlueprintData>(key: K, value: CourseBlueprintData[K]) => {
      setEditData((prev) =>
        prev
          ? { ...prev, blueprint: { ...prev.blueprint, [key]: value } }
          : prev,
      );
    },
    [],
  );

  const updateSessionField = useCallback(
    (
      sessionIndex: number,
      key: keyof CourseBlueprintSession,
      value: string,
    ) => {
      setEditData((prev) => {
        if (!prev) return prev;
        const sessions = [...prev.blueprint.sessions];
        sessions[sessionIndex] = { ...sessions[sessionIndex], [key]: value };
        return {
          ...prev,
          blueprint: { ...prev.blueprint, sessions },
        };
      });
    },
    [],
  );

  const updateLessonBlock = useCallback(
    (chapterId: string, blockType: LessonBlockType, content: string) => {
      setEditData((prev) => {
        if (!prev) return prev;
        const lessonBlocks = { ...prev.lessonBlocks };
        const chapterMap = { ...(lessonBlocks[chapterId] || {}) };
        chapterMap[blockType] = content;
        lessonBlocks[chapterId] = chapterMap;
        return { ...prev, lessonBlocks };
      });
    },
    [],
  );

  // AI: apply blueprint changes (overall or single session)
  const applyBlueprintChange = useCallback(
    (newBlueprint: CourseBlueprintData) => {
      setEditData((prev) => {
        if (!prev) return prev;
        return { ...prev, blueprint: newBlueprint };
      });
      toast('AI 已更新蓝图', 'success');
    },
    [toast],
  );

  // AI: apply lesson block changes
  const applyLessonBlockChange = useCallback(
    (chapterId: string, blockType: LessonBlockType, content: string) => {
      updateLessonBlock(chapterId, blockType, content);
      toast(`AI 已更新「${LESSON_BLOCK_LABELS[blockType]}」`, 'success');
    },
    [updateLessonBlock, toast],
  );

  if (isLoading || !course) return <PageLoading text="加载课程详情..." />;

  // Display data: editing mode uses editData, otherwise read-only from course/cache
  const displayData: EditState =
    editing && editData ? editData : makeEditState(course, chapterBlocksCache);

  const activeChapter = activeTab === 'overview' ? null : chapters[activeTab];
  const activeSessionIndex = activeTab === 'overview' ? null : activeTab;
  const activeSession =
    activeSessionIndex !== null ? displayData.blueprint.sessions[activeSessionIndex] : null;

  return (
    <div className="flex flex-row-reverse -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* RIGHT: AI Chat panel (rendered first so flex-row-reverse puts it on the right) */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{displayData.title || '课程详情'}</h3>
        </div>

        <CourseAIChatPanel
          editing={editing}
          blueprint={displayData.blueprint}
          activeTab={activeTab}
          activeBlockGroup={activeBlockGroup}
          activeChapterId={activeChapter?.id}
          chapterLessonBlocks={
            activeChapter ? displayData.lessonBlocks[activeChapter.id] || {} : {}
          }
          onApplyBlueprint={applyBlueprintChange}
          onApplyLessonBlock={applyLessonBlockChange}
        />
      </div>

      {/* LEFT: Tabbed content (rendered second, appears on the left due to flex-row-reverse) */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar with tabs + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-amber-100 text-amber-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              总
            </button>
            {displayData.blueprint.sessions.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition ${
                  activeTab === i
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateCourse.isPending || upsertBlocks.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {updateCourse.isPending || upsertBlocks.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> 保存
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {STATUS_LABELS[course.status] || course.status}
                </span>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                {course.orgId && (
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="max-w-3xl mx-auto p-6">
              <OverviewPanel
                editing={editing}
                title={displayData.title}
                description={displayData.description}
                blueprint={displayData.blueprint}
                onTitleChange={(v) =>
                  setEditData((p) => (p ? { ...p, title: v } : p))
                }
                onDescriptionChange={(v) =>
                  setEditData((p) => (p ? { ...p, description: v } : p))
                }
                onBlueprintChange={updateBlueprintField}
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
                updateSessionField(activeSessionIndex, field, value)
              }
              onUpdateBlock={(blockType, content) =>
                updateLessonBlock(activeChapter.id, blockType, content)
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              {course.status === 'blueprint'
                ? '蓝图保存后将自动生成章节'
                : '暂无章节'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Panel (course-level + blueprint fields) ────────

function OverviewPanel({
  editing,
  title,
  description,
  blueprint,
  onTitleChange,
  onDescriptionChange,
  onBlueprintChange,
}: {
  editing: boolean;
  title: string;
  description: string;
  blueprint: CourseBlueprintData;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onBlueprintChange: <K extends keyof CourseBlueprintData>(
    key: K,
    value: CourseBlueprintData[K],
  ) => void;
}) {
  const isEmpty =
    !blueprint.positioning &&
    !blueprint.targetDescription &&
    !blueprint.boundaries &&
    blueprint.goals.length === 0 &&
    blueprint.sessions.length === 0;

  return (
    <div className="space-y-4">
      {isEmpty && !editing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          这个课程还没有蓝图。点击右上角「编辑」，然后在左侧 AI 助手里描述你想要的课程，AI 会帮你生成。
        </div>
      )}

      <CardSection title="课程信息">
        <CourseField
          label="课程名称"
          value={title}
          editing={editing}
          onChange={onTitleChange}
          required
        />
        <CourseField
          label="一句话简介"
          value={description}
          editing={editing}
          onChange={onDescriptionChange}
          type="textarea"
          rows={2}
        />
      </CardSection>

      <CardSection title="蓝图字段">
        <CourseField
          label="课程定位"
          value={blueprint.positioning}
          editing={editing}
          onChange={(v) => onBlueprintChange('positioning', v)}
          type="textarea"
          rows={2}
        />
        <CourseField
          label="适用对象"
          value={blueprint.targetDescription}
          editing={editing}
          onChange={(v) => onBlueprintChange('targetDescription', v)}
        />
        <CourseField
          label="适用边界"
          value={blueprint.boundaries}
          editing={editing}
          onChange={(v) => onBlueprintChange('boundaries', v)}
          type="textarea"
          rows={2}
        />
        <CourseField
          label="课程目标"
          value={blueprint.goals.join('\n')}
          editing={editing}
          onChange={(v) =>
            onBlueprintChange(
              'goals',
              v.split('\n').map((s) => s.trim()).filter(Boolean),
            )
          }
          type="textarea"
          rows={3}
          hint="每行一个目标"
        />
        <CourseField
          label="转介建议"
          value={blueprint.referralAdvice ?? ''}
          editing={editing}
          onChange={(v) => onBlueprintChange('referralAdvice', v)}
          type="textarea"
          rows={2}
        />
      </CardSection>
    </div>
  );
}

// ─── Chapter Detail View ─────────────────────────────────────

function ChapterDetailView({
  chapter,
  session,
  sessionIndex,
  editing,
  activeBlockGroup,
  onBlockGroupChange,
  lessonBlocks,
  onUpdateSession,
  onUpdateBlock,
}: {
  chapter: any;
  session: CourseBlueprintSession;
  sessionIndex: number;
  editing: boolean;
  activeBlockGroup: 'prep' | 'class' | 'extension';
  onBlockGroupChange: (g: 'prep' | 'class' | 'extension') => void;
  lessonBlocks: Record<string, string>;
  onUpdateSession: (field: keyof CourseBlueprintSession, value: string) => void;
  onUpdateBlock: (blockType: LessonBlockType, content: string) => void;
}) {
  const currentGroup = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup) || BLOCK_GROUPS[0];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      {/* Chapter blueprint section */}
      <CardSection title={`第 ${sessionIndex + 1} 节 · 蓝图`}>
        <CourseField
          label="章节标题"
          value={session.title}
          editing={editing}
          onChange={(v) => onUpdateSession('title', v)}
        />
        <CourseField
          label="课节目标"
          value={session.goal}
          editing={editing}
          onChange={(v) => onUpdateSession('goal', v)}
          type="textarea"
          rows={2}
        />
        <CourseField
          label="核心概念"
          value={session.coreConcepts}
          editing={editing}
          onChange={(v) => onUpdateSession('coreConcepts', v)}
          type="textarea"
          rows={3}
        />
        <CourseField
          label="互动建议"
          value={session.interactionSuggestions}
          editing={editing}
          onChange={(v) => onUpdateSession('interactionSuggestions', v)}
          type="textarea"
          rows={3}
        />
        <CourseField
          label="课后作业建议"
          value={session.homeworkSuggestion}
          editing={editing}
          onChange={(v) => onUpdateSession('homeworkSuggestion', v)}
          type="textarea"
          rows={2}
        />
      </CardSection>

      {/* Lesson blocks section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">教案内容</h3>
          {/* Sub-tab switcher */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {BLOCK_GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => onBlockGroupChange(g.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeBlockGroup === g.key
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {currentGroup.blocks.map((blockType) => (
            <LessonBlockEditor
              key={blockType}
              blockType={blockType}
              value={lessonBlocks[blockType] || ''}
              editing={editing}
              onChange={(v) => onUpdateBlock(blockType, v)}
            />
          ))}
        </div>
      </div>

      {/* Phase 9α — C-facing content blocks (what the learner consumes in the portal) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">学员可见内容</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            来访者在 Portal 里实际看到 / 听到 / 填写的内容块
          </p>
        </div>
        <div className="p-4">
          <ContentBlockPanel parentType="course" parentId={chapter.id} />
        </div>
      </div>
    </div>
  );
}

// ─── Lesson Block Editor ─────────────────────────────────────

function LessonBlockEditor({
  blockType,
  value,
  editing,
  onChange,
}: {
  blockType: LessonBlockType;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  const label = LESSON_BLOCK_LABELS[blockType];

  return (
    <div className="p-4">
      <label className="text-xs text-slate-500 font-semibold block mb-2">{label}</label>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder={`在此编辑「${label}」内容，或在左侧 AI 助手中描述你想要的修改...`}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y font-mono"
        />
      ) : value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-xs text-slate-300 italic">未填写</p>
      )}
    </div>
  );
}

// ─── Card Section ────────────────────────────────────────────

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

// ─── Course Field ────────────────────────────────────────────

function CourseField({
  label,
  value,
  editing,
  onChange,
  type = 'input',
  rows = 2,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: 'input' | 'textarea';
  rows?: number;
  required?: boolean;
  hint?: string;
}) {
  if (!editing && !value) {
    return (
      <div>
        <label className="text-xs text-slate-400 font-medium block mb-1">{label}</label>
        <p className="text-xs text-slate-300 italic">未填写</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-slate-400 font-medium block mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-slate-300 ml-2">{hint}</span>}
      </label>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        )
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
};

function CourseAIChatPanel({
  editing,
  blueprint,
  activeTab,
  activeBlockGroup,
  activeChapterId,
  chapterLessonBlocks,
  onApplyBlueprint,
  onApplyLessonBlock,
}: {
  editing: boolean;
  blueprint: CourseBlueprintData;
  activeTab: 'overview' | number;
  activeBlockGroup: 'prep' | 'class' | 'extension';
  activeChapterId?: string;
  chapterLessonBlocks: Record<string, string>;
  onApplyBlueprint: (newBlueprint: CourseBlueprintData) => void;
  onApplyLessonBlock: (chapterId: string, blockType: LessonBlockType, content: string) => void;
}) {
  const refineBlueprint = useRefineCourseBlueprint();
  const refineBlock = useRefineLessonBlock();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善课程。\n\n• 选中「总」时，修改针对整体蓝图\n• 选中某一章节时，修改针对该章节及当前的教案部分（教学准备/课堂活动/课后延伸）',
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const isPending = refineBlueprint.isPending || refineBlock.isPending;
  const disabled = !editing;

  // Context hint shown above input
  const contextHint = useMemo(() => {
    if (activeTab === 'overview') return '当前: 整体蓝图';
    const groupLabel = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.label || '';
    return `当前: 第 ${(activeTab as number) + 1} 节 · ${groupLabel}`;
  }, [activeTab, activeBlockGroup]);

  const handleSend = () => {
    if (disabled) return;
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages((p) => [...p, { role: 'user', content: text }]);

    if (activeTab === 'overview') {
      // Refine the entire blueprint
      refineBlueprint.mutate(
        { currentBlueprint: blueprint, instruction: text },
        {
          onSuccess: (data) => {
            onApplyBlueprint(data);
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: `已更新蓝图（${data.sessions.length} 节），右侧已刷新。` },
            ]);
          },
          onError: (err) => {
            setMessages((p) => [
              ...p,
              {
                role: 'assistant',
                content: err instanceof Error ? `修改失败：${err.message}` : '修改失败，请重试',
              },
            ]);
          },
        },
      );
      return;
    }

    // Chapter-level: refine all blocks in the current sub-tab in parallel
    const sessionIndex = activeTab as number;
    if (!activeChapterId) {
      setMessages((p) => [
        ...p,
        { role: 'assistant', content: '当前章节还没有内容，请先保存蓝图。' },
      ]);
      return;
    }

    const groupBlocks = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.blocks || [];
    // For each block in the group, call refineLessonBlock
    const calls = groupBlocks.map((blockType) => {
      const existing = chapterLessonBlocks[blockType] || '';
      // For empty blocks, instruction becomes "generate"; the refine endpoint
      // tolerates empty content as a generation request
      return refineBlock
        .mutateAsync({
          blockContent: existing,
          instruction: text,
          blueprint,
          sessionIndex,
        })
        .then((res) => {
          if (res.content) {
            onApplyLessonBlock(activeChapterId, blockType, res.content);
          }
          return { blockType, ok: true as const };
        })
        .catch((err) => ({
          blockType,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        }));
    });

    Promise.all(calls).then((results) => {
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const groupLabel = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.label || '';
      if (failCount === 0) {
        setMessages((p) => [
          ...p,
          { role: 'assistant', content: `已更新「${groupLabel}」的 ${okCount} 个区块。` },
        ]);
      } else {
        setMessages((p) => [
          ...p,
          {
            role: 'assistant',
            content: `已更新 ${okCount} 个区块，${failCount} 个失败。`,
          },
        ]);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900">AI 助手</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {/* Disabled overlay when not editing */}
        {disabled && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改课程
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <p className="text-xs text-slate-400 mb-1.5">{contextHint}</p>
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            placeholder={disabled ? '请先点击编辑' : '输入修改意见...'}
            disabled={disabled || isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={disabled || isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
