import { useMutation } from '@tanstack/react-query';
import type { CourseBlueprintData, CourseRequirementsConfig } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function aiPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/ai`;
}

export type CreateCourseChatResponse =
  | { type: 'message'; content: string }
  | {
      type: 'course';
      summary: string;
      course: {
        title: string;
        description: string;
        category?: string;
        courseType?: string;
        targetAudience?: string;
        requirements: CourseRequirementsConfig;
        blueprint: CourseBlueprintData;
      };
    };

/** AI-guided course creation via multi-turn conversation */
export function useCreateCourseChat() {
  return useMutation({
    mutationFn: (data: { messages: { role: 'user' | 'assistant'; content: string }[] }) =>
      api.post<CreateCourseChatResponse>(`${aiPrefix()}/create-course-chat`, data),
  });
}

export interface ExtractedCourseDraft {
  title: string;
  description: string;
  category?: string;
  courseType?: string;
  targetAudience?: string;
  requirements: CourseRequirementsConfig;
  blueprint: CourseBlueprintData;
}

/** Extract a structured course draft from raw text input */
export function useExtractCourse() {
  return useMutation({
    mutationFn: (data: { content: string }) =>
      api.post<ExtractedCourseDraft>(`${aiPrefix()}/extract-course`, data),
  });
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
