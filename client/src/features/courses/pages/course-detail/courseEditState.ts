import type { CourseBlueprintData } from '@psynote/shared';
import { LESSON_BLOCK_ORDER } from '@psynote/shared';
import type { EditState } from './types';
import { emptyBlueprint } from './types';

/**
 * Drive the 3-phase save pipeline for a course: update metadata + blueprint,
 * then (iff the course is still a blueprint) confirm to materialize chapters,
 * then fan out per-chapter lesson-block upserts.
 *
 * Left as a plain function (vs. a method on the state hook) because each
 * mutation's `mutateAsync` comes from a distinct useMutation at the
 * orchestrator; we want callers to pass them in explicitly rather than
 * hide them in a hook's closure.
 */
export async function runSavePipeline(opts: {
  courseId: string;
  editData: EditState;
  currentStatus: string;
  updateCourse: (args: {
    courseId: string;
    title: string;
    description: string;
    blueprintData: CourseBlueprintData;
  }) => Promise<unknown>;
  confirmBlueprint: (args: { courseId: string; sessions: CourseBlueprintData['sessions'] }) => Promise<unknown>;
  upsertBlocks: (args: {
    courseId: string;
    chapterId: string;
    blocks: { blockType: string; content: string | undefined; sortOrder: number }[];
  }) => Promise<unknown>;
}): Promise<void> {
  const { courseId, editData, currentStatus, updateCourse, confirmBlueprint, upsertBlocks } = opts;

  await updateCourse({
    courseId,
    title: editData.title,
    description: editData.description,
    blueprintData: editData.blueprint,
  });

  if (currentStatus === 'blueprint' && editData.blueprint.sessions.length > 0) {
    await confirmBlueprint({ courseId, sessions: editData.blueprint.sessions });
  }

  for (const [chapterId, blockMap] of Object.entries(editData.lessonBlocks)) {
    const blocks = LESSON_BLOCK_ORDER.map((bt, i) => ({
      blockType: bt,
      content: blockMap[bt] || undefined,
      sortOrder: i,
    }));
    await upsertBlocks({ courseId, chapterId, blocks });
  }
}

/**
 * Forward transform: backend course row + cached per-chapter lesson
 * blocks → the UI's editable shape. Materializes blocks into a fully
 * keyed map (even block types that don't yet have content get '' so
 * the field editor can bind to them without a nullish guard).
 */
export function makeEditState(
  course: any,
  chapterBlocks: Record<string, any[]>,
): EditState {
  const blueprint: CourseBlueprintData =
    course.blueprintData ?? emptyBlueprint(course.title || '');

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
