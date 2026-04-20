import type { CourseBlueprintData, LessonBlockType } from '@psynote/shared';

/**
 * Shared types & constants for CourseDetail's edit tree.
 *
 * `EditState` is flat-ish (title/description at top, blueprint nested,
 * lesson blocks indexed by chapter id) to make setState patches cheap
 * without needing a reducer. Mirrors the backend course shape except
 * lesson blocks are already pre-materialized per chapter for ergonomic
 * read access in the editor.
 */

export interface EditState {
  title: string;
  description: string;
  blueprint: CourseBlueprintData;
  /** chapterId → blockType → content */
  lessonBlocks: Record<string, Record<string, string>>;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  blueprint: '蓝图',
  content_authoring: '编辑中',
  published: '已发布',
  archived: '已归档',
};

export type BlockGroupKey = 'prep' | 'class' | 'extension';

/**
 * Lesson blocks grouped into 3 sub-tabs inside the chapter detail view.
 * This ordering is the contract for both the UI and the AI refinement
 * flow (send-to-group routes through BLOCK_GROUPS[activeGroup].blocks).
 */
export const BLOCK_GROUPS: { key: BlockGroupKey; label: string; blocks: LessonBlockType[] }[] = [
  { key: 'prep', label: '教学准备', blocks: ['objectives', 'key_points', 'preparation'] },
  { key: 'class', label: '课堂活动', blocks: ['warmup', 'main_activity', 'experience', 'sharing'] },
  { key: 'extension', label: '课后延伸', blocks: ['extension', 'reflection'] },
];

export function emptyBlueprint(title = ''): CourseBlueprintData {
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
