import { ArrowLeft, Sparkles } from 'lucide-react';
import type { CourseBlueprintData, LessonBlockType } from '@psynote/shared';
import { CourseAIChatPanel } from './CourseAIChatPanel';
import type { BlockGroupKey } from './types';

/**
 * Fixed 420px right-rail wrapping the AI chat panel, with its own
 * header (back button + course title). Pulled out of CourseDetail so
 * the orchestrator stays under the 200-line target.
 */
export function CourseDetailSidebar({
  title,
  onBack,
  editing,
  blueprint,
  activeTab,
  activeBlockGroup,
  activeChapterId,
  chapterLessonBlocks,
  onApplyBlueprint,
  onApplyLessonBlock,
}: {
  title: string;
  onBack: () => void;
  editing: boolean;
  blueprint: CourseBlueprintData;
  activeTab: 'overview' | number;
  activeBlockGroup: BlockGroupKey;
  activeChapterId?: string;
  chapterLessonBlocks: Record<string, string>;
  onApplyBlueprint: (newBlueprint: CourseBlueprintData) => void;
  onApplyLessonBlock: (chapterId: string, blockType: LessonBlockType, content: string) => void;
}) {
  return (
    <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="font-bold text-slate-900 truncate">{title || '课程详情'}</h3>
      </div>
      <CourseAIChatPanel
        editing={editing}
        blueprint={blueprint}
        activeTab={activeTab}
        activeBlockGroup={activeBlockGroup}
        activeChapterId={activeChapterId}
        chapterLessonBlocks={chapterLessonBlocks}
        onApplyBlueprint={onApplyBlueprint}
        onApplyLessonBlock={onApplyLessonBlock}
      />
    </div>
  );
}
