import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Course, CourseEnrollment, CourseTemplateTag, CourseLessonBlock } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import { libraryApi, libraryScopeKey } from '../shared/api/libraryScope';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Course Queries (library — routes via libraryApi) ───────────
// Course-instance operations (publish/enroll/blocks/tags/etc.) below keep
// using orgPrefix since instances are always org-scoped. Only the template
// CRUD (list/detail/create/update/delete) routes through libraryApi so
// the system admin can manage platform-level course templates.

export function useCourses(filters?: {
  status?: string;
  courseType?: string;
  isTemplate?: boolean;
  search?: string;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.courseType) params.set('courseType', filters.courseType);
  if (filters?.isTemplate !== undefined) params.set('isTemplate', String(filters.isTemplate));
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: ['courses', libraryScopeKey(), filters],
    queryFn: () => api.get<Course[]>(`${libraryApi('courses')}${qs ? `?${qs}` : ''}`),
    enabled: !!orgId || isSystemAdmin,
  });
}

export function useCourse(courseId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
  return useQuery({
    queryKey: ['courses', libraryScopeKey(), courseId],
    queryFn: () => api.get<Course>(`${libraryApi('courses')}/${courseId}`),
    enabled: (!!orgId || isSystemAdmin) && !!courseId,
  });
}

// ─── Course Mutations ───────────────────────────────────────────

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Course> & { title: string }) =>
      api.post<Course>(libraryApi('courses'), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, ...data }: { courseId: string } & Partial<Course>) =>
      api.patch<Course>(`${libraryApi('courses')}/${courseId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.delete(`${libraryApi('courses')}/${courseId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function usePublishCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.post<Course>(`${orgPrefix()}/courses/${courseId}/publish`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useArchiveCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.post<Course>(`${orgPrefix()}/courses/${courseId}/archive`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useCloneCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.post<Course>(`${orgPrefix()}/courses/${courseId}/clone`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useConfirmBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, sessions }: {
      courseId: string;
      sessions: { title: string; goal: string; coreConcepts: string; interactionSuggestions: string; homeworkSuggestion: string }[];
    }) => api.post(`${orgPrefix()}/courses/${courseId}/confirm-blueprint`, { sessions }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

// ─── Enrollment ─────────────────────────────────────────────────

export function useEnrollInCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, careEpisodeId }: { courseId: string; careEpisodeId?: string }) =>
      api.post<CourseEnrollment>(`${orgPrefix()}/courses/${courseId}/enroll`, { careEpisodeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useAssignCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, clientUserId, careEpisodeId }: {
      courseId: string;
      clientUserId: string;
      careEpisodeId?: string;
    }) => api.post<CourseEnrollment>(`${orgPrefix()}/courses/${courseId}/assign`, { clientUserId, careEpisodeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

export function useUpdateCourseProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, chapterId, completed }: {
      enrollmentId: string;
      chapterId: string;
      completed: boolean;
    }) => api.patch(`${orgPrefix()}/courses/enrollments/${enrollmentId}/progress`, { chapterId, completed }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); },
  });
}

// ─── Lesson Blocks ──────────────────────────────────────────────

export function useLessonBlocks(courseId: string | undefined, chapterId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['lesson-blocks', orgId, courseId, chapterId],
    queryFn: () => api.get<CourseLessonBlock[]>(`${orgPrefix()}/courses/${courseId}/chapters/${chapterId}/blocks`),
    enabled: !!orgId && !!courseId && !!chapterId,
  });
}

export function useUpsertLessonBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, chapterId, blocks }: {
      courseId: string;
      chapterId: string;
      blocks: { blockType: string; content?: string; sortOrder: number; aiGenerated?: boolean; lastAiInstruction?: string }[];
    }) => api.put<CourseLessonBlock[]>(`${orgPrefix()}/courses/${courseId}/chapters/${chapterId}/blocks`, { blocks }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson-blocks'] }); },
  });
}

export function useUpdateLessonBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, chapterId, blockId, ...data }: {
      courseId: string;
      chapterId: string;
      blockId: string;
      content?: string;
      aiGenerated?: boolean;
      lastAiInstruction?: string;
    }) => api.patch<CourseLessonBlock>(
      `${orgPrefix()}/courses/${courseId}/chapters/${chapterId}/blocks/${blockId}`,
      data,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson-blocks'] }); },
  });
}

// ─── Template Tags ──────────────────────────────────────────────

export function useTemplateTags() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-template-tags', orgId],
    queryFn: () => api.get<CourseTemplateTag[]>(`${orgPrefix()}/courses/template-tags`),
    enabled: !!orgId,
  });
}

export function useCreateTemplateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api.post<CourseTemplateTag>(`${orgPrefix()}/courses/template-tags`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-template-tags'] }); },
  });
}

export function useDeleteTemplateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.delete(`${orgPrefix()}/courses/template-tags/${tagId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-template-tags'] }); },
  });
}
