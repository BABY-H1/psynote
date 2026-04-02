import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LESSON_BLOCK_LABELS,
  LESSON_BLOCK_ORDER,
  type CourseBlueprintData,
  type LessonBlockType,
} from '@psynote/shared';
import {
  useCourse,
  useLessonBlocks,
  useUpsertLessonBlocks,
  useUpdateLessonBlock,
} from '../../../api/useCourses';
import {
  useGenerateLessonBlocks,
  useGenerateSingleLessonBlock,
  useRefineLessonBlock,
} from '../../../api/useCourseAuthoring';
import { useToast } from '../../../shared/components';

// ─── Types ─────────────────────────────────────────────────────

interface LocalBlock {
  blockType: LessonBlockType;
  content: string;
  sortOrder: number;
}

type StyleOption = '更专业' | '更温和' | '更生动' | '更简洁';
type AudienceOption = '适合家长' | '适合学生' | '适合教师';

const STYLE_OPTIONS: StyleOption[] = ['更专业', '更温和', '更生动', '更简洁'];
const AUDIENCE_OPTIONS: AudienceOption[] = ['适合家长', '适合学生', '适合教师'];

// ─── Component ─────────────────────────────────────────────────

export function LessonEditor() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();
  const navigate = useNavigate();

  // Queries
  const { data: course } = useCourse(courseId);
  const { data: savedBlocks } = useLessonBlocks(courseId, chapterId);

  // Mutations
  const upsertBlocks = useUpsertLessonBlocks();
  const updateBlock = useUpdateLessonBlock();
  const generateAllBlocks = useGenerateLessonBlocks();
  const generateSingleBlock = useGenerateSingleLessonBlock();
  const refineBlock = useRefineLessonBlock();
  const { toast } = useToast();

  // Local state
  const [blocks, setBlocks] = useState<LocalBlock[]>(() =>
    LESSON_BLOCK_ORDER.map((bt, i) => ({ blockType: bt, content: '', sortOrder: i })),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    LESSON_BLOCK_ORDER.forEach((bt, i) => {
      init[bt] = i !== 0;
    });
    return init;
  });
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Debounce auto-save ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Derive chapter metadata
  const chapter = course?.chapters?.find((c) => c.id === chapterId);
  const sessionIndex = course?.chapters?.findIndex((c) => c.id === chapterId) ?? -1;
  const blueprint = course?.blueprintData as CourseBlueprintData | undefined;

  // ─── Initialize from server data ────────────────────────────

  useEffect(() => {
    if (!savedBlocks || savedBlocks.length === 0) return;
    setBlocks(
      LESSON_BLOCK_ORDER.map((bt, i) => {
        const existing = savedBlocks.find((b) => b.blockType === bt);
        return { blockType: bt, content: existing?.content ?? '', sortOrder: i };
      }),
    );
  }, [savedBlocks]);

  // ─── Auto-save (debounced 2s) ───────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!courseId || !chapterId) return;
      upsertBlocks.mutate({
        courseId,
        chapterId,
        blocks: blocksRef.current.map((b) => ({
          blockType: b.blockType,
          content: b.content || undefined,
          sortOrder: b.sortOrder,
        })),
      });
    }, 2000);
  }, [courseId, chapterId, upsertBlocks]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ─── Block helpers ──────────────────────────────────────────

  function updateBlockContent(blockType: LessonBlockType, content: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.blockType === blockType ? { ...b, content } : b)),
    );
    scheduleSave();
  }

  function toggleCollapse(blockType: string) {
    setCollapsed((prev) => ({ ...prev, [blockType]: !prev[blockType] }));
  }

  function togglePreview(blockType: string) {
    setPreviewing((prev) => ({ ...prev, [blockType]: !prev[blockType] }));
  }

  function setAiLoading(key: string, loading: boolean) {
    setLoadingAi((prev) => ({ ...prev, [key]: loading }));
  }

  // ─── AI: Generate all blocks ────────────────────────────────

  async function handleGenerateAll() {
    if (!blueprint || sessionIndex < 0) return;
    setAiLoading('all', true);
    try {
      const result = await generateAllBlocks.mutateAsync({
        blueprint,
        sessionIndex,
      });
      if (result.blocks) {
        setBlocks((prev) =>
          prev.map((b) => {
            const generated = result.blocks.find((g) => g.blockType === b.blockType);
            return generated ? { ...b, content: generated.content } : b;
          }),
        );
        scheduleSave();
        toast('全部内容已生成', 'success');
      }
    } finally {
      setAiLoading('all', false);
    }
  }

  // ─── AI: Generate single block ──────────────────────────────

  async function handleGenerateSingle(blockType: LessonBlockType) {
    if (!blueprint || sessionIndex < 0) return;
    const key = `gen-${blockType}`;
    setAiLoading(key, true);
    try {
      const existingBlocks = blocks
        .filter((b) => b.content)
        .map((b) => ({ blockType: b.blockType, content: b.content }));
      const result = await generateSingleBlock.mutateAsync({
        blueprint,
        sessionIndex,
        blockType,
        existingBlocks,
      });
      if (result.content) {
        updateBlockContent(blockType, result.content);
        toast('内容已生成', 'success');
      }
    } finally {
      setAiLoading(key, false);
    }
  }

  // ─── AI: Refine block ──────────────────────────────────────

  async function handleRefine(blockType: LessonBlockType, instruction: string) {
    const block = blocks.find((b) => b.blockType === blockType);
    if (!block?.content) return;
    const key = `refine-${blockType}-${instruction}`;
    setAiLoading(key, true);
    setOpenDropdown(null);
    try {
      const result = await refineBlock.mutateAsync({
        blockContent: block.content,
        instruction,
        blueprint,
        sessionIndex: sessionIndex >= 0 ? sessionIndex : undefined,
      });
      if (result.content) {
        updateBlockContent(blockType, result.content);
      }
    } finally {
      setAiLoading(key, false);
    }
  }

  // ─── Close dropdowns on outside click ───────────────────────

  useEffect(() => {
    if (!openDropdown) return;
    function handleClick() {
      setOpenDropdown(null);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openDropdown]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/courses')}
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronLeftIcon />
          <span>返回课程</span>
        </button>
        <h1 className="text-xl font-semibold text-slate-800">
          {chapter?.title ?? '课时编辑'}
        </h1>
        {chapter?.sessionGoal && (
          <p className="mt-1 text-sm text-slate-500">
            目标：{chapter.sessionGoal}
          </p>
        )}
      </div>

      {/* Generate all button */}
      <div className="mb-6">
        <button
          onClick={handleGenerateAll}
          disabled={loadingAi['all'] || !blueprint}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {loadingAi['all'] ? (
            <Spinner />
          ) : (
            <SparklesIcon />
          )}
          生成全部内容
        </button>
        {!blueprint && (
          <span className="ml-3 text-xs text-slate-400">请先生成课程蓝图</span>
        )}
      </div>

      {/* Block cards */}
      <div className="space-y-4">
        {blocks.map((block) => {
          const isCollapsed = collapsed[block.blockType] ?? false;
          const isPreview = previewing[block.blockType] ?? false;
          const label = LESSON_BLOCK_LABELS[block.blockType];

          return (
            <div
              key={block.blockType}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              {/* Card header */}
              <button
                onClick={() => toggleCollapse(block.blockType)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <ChevronIcon rotated={!isCollapsed} />
              </button>

              {/* Collapsed preview */}
              {isCollapsed && block.content && (
                <div className="border-t border-slate-100 px-4 py-2">
                  <p className="truncate text-xs text-slate-400">
                    {block.content.slice(0, 100)}
                    {block.content.length > 100 ? '...' : ''}
                  </p>
                </div>
              )}

              {/* Expanded content */}
              {!isCollapsed && (
                <div className="border-t border-slate-100 px-4 py-4">
                  {/* Editor / Preview toggle */}
                  <div className="mb-2 flex items-center justify-end">
                    <button
                      onClick={() => togglePreview(block.blockType)}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      {isPreview ? '编辑' : '预览'}
                    </button>
                  </div>

                  {isPreview ? (
                    <div className="min-h-[8rem] whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                      {block.content || '（暂无内容）'}
                    </div>
                  ) : (
                    <textarea
                      rows={8}
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.blockType, e.target.value)}
                      placeholder={`在此编辑 ${label} 内容...`}
                      className="w-full resize-y rounded border border-slate-200 bg-white p-3 font-mono text-sm text-slate-700 placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  )}

                  {/* AI action bar */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* Generate single */}
                    <AiButton
                      loading={!!loadingAi[`gen-${block.blockType}`]}
                      onClick={() => handleGenerateSingle(block.blockType)}
                    >
                      AI 生成
                    </AiButton>

                    {/* Rewrite */}
                    <AiButton
                      loading={!!loadingAi[`refine-${block.blockType}-重写这段内容，使其更清晰流畅`]}
                      onClick={() => handleRefine(block.blockType, '重写这段内容，使其更清晰流畅')}
                      disabled={!block.content}
                    >
                      重写
                    </AiButton>

                    {/* Expand */}
                    <AiButton
                      loading={!!loadingAi[`refine-${block.blockType}-扩写这段内容，增加更多细节和例子`]}
                      onClick={() => handleRefine(block.blockType, '扩写这段内容，增加更多细节和例子')}
                      disabled={!block.content}
                    >
                      扩写
                    </AiButton>

                    {/* Shorten */}
                    <AiButton
                      loading={!!loadingAi[`refine-${block.blockType}-缩短这段内容，保留核心信息`]}
                      onClick={() => handleRefine(block.blockType, '缩短这段内容，保留核心信息')}
                      disabled={!block.content}
                    >
                      缩短
                    </AiButton>

                    {/* Style dropdown */}
                    <DropdownButton
                      label="改风格"
                      id={`style-${block.blockType}`}
                      open={openDropdown === `style-${block.blockType}`}
                      onToggle={(id) => setOpenDropdown((prev) => (prev === id ? null : id))}
                      options={STYLE_OPTIONS}
                      loadingKeys={loadingAi}
                      blockType={block.blockType}
                      disabled={!block.content}
                      onSelect={(option) =>
                        handleRefine(block.blockType, `将这段内容改写为${option}的风格`)
                      }
                      getLoadingKey={(option) =>
                        `refine-${block.blockType}-将这段内容改写为${option}的风格`
                      }
                    />

                    {/* Audience dropdown */}
                    <DropdownButton
                      label="改对象"
                      id={`audience-${block.blockType}`}
                      open={openDropdown === `audience-${block.blockType}`}
                      onToggle={(id) => setOpenDropdown((prev) => (prev === id ? null : id))}
                      options={AUDIENCE_OPTIONS}
                      loadingKeys={loadingAi}
                      blockType={block.blockType}
                      disabled={!block.content}
                      onSelect={(option) =>
                        handleRefine(block.blockType, `改写这段内容，使其${option}阅读`)
                      }
                      getLoadingKey={(option) =>
                        `refine-${block.blockType}-改写这段内容，使其${option}阅读`
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom action */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => navigate('/courses')}
          className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          返回课程
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function AiButton({
  children,
  loading,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function DropdownButton({
  label,
  id,
  open,
  onToggle,
  options,
  loadingKeys,
  blockType,
  disabled,
  onSelect,
  getLoadingKey,
}: {
  label: string;
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  options: string[];
  loadingKeys: Record<string, boolean>;
  blockType: LessonBlockType;
  disabled?: boolean;
  onSelect: (option: string) => void;
  getLoadingKey: (option: string) => string;
}) {
  const anyLoading = options.some((o) => loadingKeys[getLoadingKey(o)]);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(id);
        }}
        disabled={anyLoading || disabled}
        className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {anyLoading && <Spinner />}
        {label}
        <ChevronDownSmall />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[7rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(option);
              }}
              disabled={!!loadingKeys[getLoadingKey(option)]}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingKeys[getLoadingKey(option)] && <Spinner />}
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Icons (inline SVG) ───────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-slate-400 transition-transform ${rotated ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronDownSmall() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
