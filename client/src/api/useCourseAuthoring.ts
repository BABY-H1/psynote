import { useMutation } from '@tanstack/react-query';
import type { CourseBlueprintData, CourseRequirementsConfig } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function aiPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/ai`;
}

/** Generate course blueprint from structured requirements */
export function useGenerateCourseBlueprint() {
  return useMutation({
    mutationFn: (data: { requirements: CourseRequirementsConfig }) =>
      api.post<CourseBlueprintData>(`${aiPrefix()}/generate-course-blueprint`, data),
  });
}

/** Refine an existing course blueprint with instruction */
export function useRefineCourseBlueprint() {
  return useMutation({
    mutationFn: (data: {
      currentBlueprint: CourseBlueprintData;
      instruction: string;
      requirements?: CourseRequirementsConfig;
    }) => api.post<CourseBlueprintData>(`${aiPrefix()}/refine-course-blueprint`, data),
  });
}

/** Generate all 9 lesson blocks for one session */
export function useGenerateLessonBlocks() {
  return useMutation({
    mutationFn: (data: {
      blueprint: CourseBlueprintData;
      sessionIndex: number;
      requirements?: CourseRequirementsConfig;
    }) => api.post<{ blocks: { blockType: string; content: string }[] }>(`${aiPrefix()}/generate-lesson-blocks`, data),
  });
}

/** Generate a single lesson block */
export function useGenerateSingleLessonBlock() {
  return useMutation({
    mutationFn: (data: {
      blueprint: CourseBlueprintData;
      sessionIndex: number;
      blockType: string;
      existingBlocks?: { blockType: string; content: string }[];
    }) => api.post<{ content: string }>(`${aiPrefix()}/generate-lesson-block`, data),
  });
}

/** Refine a lesson block with instruction */
export function useRefineLessonBlock() {
  return useMutation({
    mutationFn: (data: {
      blockContent: string;
      instruction: string;
      blueprint?: CourseBlueprintData;
      sessionIndex?: number;
    }) => api.post<{ content: string }>(`${aiPrefix()}/refine-lesson-block`, data),
  });
}
