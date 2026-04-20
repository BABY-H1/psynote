import type { CourseBlueprintSession, LessonBlockType } from '@psynote/shared';
import { ContentBlockPanel } from '../../../knowledge/components/ContentBlockPanel';
import { CardSection, CourseField } from './CourseFieldPrimitives';
import { LessonBlockEditor } from './LessonBlockEditor';
import { BLOCK_GROUPS, type BlockGroupKey } from './types';

/**
 * The per-session detail view. Three stacked card sections:
 *   1. Chapter blueprint — the session's objectives, core concepts,
 *      interaction suggestions, homework.
 *   2. Lesson blocks (教案内容) — toggles between 3 sub-groups (prep /
 *      class / extension) and fans out to a LessonBlockEditor per block.
 *   3. Learner-visible content — ContentBlockPanel (Phase 9α) for what
 *      the Portal-side user actually consumes.
 */
export function ChapterDetailView({
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
  activeBlockGroup: BlockGroupKey;
  onBlockGroupChange: (g: BlockGroupKey) => void;
  lessonBlocks: Record<string, string>;
  onUpdateSession: (field: keyof CourseBlueprintSession, value: string) => void;
  onUpdateBlock: (blockType: LessonBlockType, content: string) => void;
}) {
  const currentGroup = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup) || BLOCK_GROUPS[0];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <CardSection title={`第 ${sessionIndex + 1} 节 · 蓝图`}>
        <CourseField label="章节标题" value={session.title} editing={editing} onChange={(v) => onUpdateSession('title', v)} />
        <CourseField label="课节目标" value={session.goal} editing={editing} onChange={(v) => onUpdateSession('goal', v)} type="textarea" rows={2} />
        <CourseField label="核心概念" value={session.coreConcepts} editing={editing} onChange={(v) => onUpdateSession('coreConcepts', v)} type="textarea" rows={3} />
        <CourseField label="互动建议" value={session.interactionSuggestions} editing={editing} onChange={(v) => onUpdateSession('interactionSuggestions', v)} type="textarea" rows={3} />
        <CourseField label="课后作业建议" value={session.homeworkSuggestion} editing={editing} onChange={(v) => onUpdateSession('homeworkSuggestion', v)} type="textarea" rows={2} />
      </CardSection>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">教案内容</h3>
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

      {/* Phase 9α — learner-visible content blocks */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">学员可见内容</h3>
          <p className="text-xs text-slate-400 mt-0.5">来访者在 Portal 里实际看到 / 听到 / 填写的内容块</p>
        </div>
        <div className="p-4">
          <ContentBlockPanel parentType="course" parentId={chapter.id} />
        </div>
      </div>
    </div>
  );
}
