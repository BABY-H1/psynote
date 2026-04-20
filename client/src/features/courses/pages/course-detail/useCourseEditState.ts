import { useCallback, useState } from 'react';
import type {
  CourseBlueprintData,
  CourseBlueprintSession,
  LessonBlockType,
} from '@psynote/shared';
import type { EditState } from './types';

/**
 * Encapsulates `editData` + all 3 updater callbacks that patch into the
 * EditState tree.
 *
 * Pulled out so the orchestrator (CourseDetail.tsx) stays under the
 * 200-line target. Only handlers that are pure state mutations live
 * here; anything touching mutations / toasts (handleSave, handleDelete,
 * applyBlueprintChange, applyLessonBlockChange) stays in the
 * orchestrator where the side-effect dependencies live.
 */
export function useCourseEditState() {
  const [editData, setEditData] = useState<EditState | null>(null);

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
    (sessionIndex: number, key: keyof CourseBlueprintSession, value: string) => {
      setEditData((prev) => {
        if (!prev) return prev;
        const sessions = [...prev.blueprint.sessions];
        sessions[sessionIndex] = { ...sessions[sessionIndex], [key]: value };
        return { ...prev, blueprint: { ...prev.blueprint, sessions } };
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

  const patchTitle = useCallback(
    (title: string) => setEditData((p) => (p ? { ...p, title } : p)),
    [],
  );

  const patchDescription = useCallback(
    (description: string) => setEditData((p) => (p ? { ...p, description } : p)),
    [],
  );

  const patchBlueprint = useCallback(
    (blueprint: CourseBlueprintData) =>
      setEditData((p) => (p ? { ...p, blueprint } : p)),
    [],
  );

  return {
    editData,
    setEditData,
    updateBlueprintField,
    updateSessionField,
    updateLessonBlock,
    patchTitle,
    patchDescription,
    patchBlueprint,
  };
}
