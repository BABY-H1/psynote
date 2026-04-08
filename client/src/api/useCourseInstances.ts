import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CourseInstance } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Instance Queries ──────────────────────────────────────────

export function useCourseInstances(filters?: {
  status?: string;
  courseId?: string;
  search?: string;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.courseId) params.set('courseId', filters.courseId);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: ['course-instances', orgId, filters],
    queryFn: () => api.get<CourseInstance[]>(`${orgPrefix()}/course-instances${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

export function useCourseInstance(instanceId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId],
    queryFn: () => api.get<CourseInstance>(`${orgPrefix()}/course-instances/${instanceId}`),
    enabled: !!orgId && !!instanceId,
  });
}

// ─── Instance Mutations ────────────────────────────────────────

export function useCreateCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<any>(`${orgPrefix()}/course-instances`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useUpdateCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: { instanceId: string } & Record<string, unknown>) =>
      api.patch<any>(`${orgPrefix()}/course-instances/${instanceId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useDeleteCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.delete(`${orgPrefix()}/course-instances/${instanceId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useActivateCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useCloseCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useArchiveCourseInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/archive`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

// ─── Enrollments ───────────────────────────────────────────────

export function useInstanceEnrollments(instanceId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId, 'enrollments'],
    queryFn: () => api.get<any[]>(`${orgPrefix()}/course-instances/${instanceId}/enrollments`),
    enabled: !!orgId && !!instanceId,
  });
}

export function useAssignToInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: {
      instanceId: string;
      userIds: string[];
      careEpisodeId?: string;
    }) => api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/assign`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useBatchEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: {
      instanceId: string;
      userIds: string[];
      groupLabel?: string;
    }) => api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/batch-enroll`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useUpdateEnrollmentApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, enrollmentId, ...data }: {
      instanceId: string;
      enrollmentId: string;
      approvalStatus: string;
    }) => api.patch<any>(
      `${orgPrefix()}/course-instances/${instanceId}/enrollments/${enrollmentId}`,
      data,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

// ─── Feedback Forms ────────────────────────────────────────────

export function useFeedbackForms(instanceId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId, 'feedback-forms'],
    queryFn: () => api.get<any[]>(`${orgPrefix()}/course-instances/${instanceId}/feedback-forms`),
    enabled: !!orgId && !!instanceId,
  });
}

export function useCreateFeedbackForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: { instanceId: string } & Record<string, unknown>) =>
      api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/feedback-forms`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useFeedbackResponses(instanceId: string | null, formId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId, 'feedback-forms', formId, 'responses'],
    queryFn: () => api.get<any[]>(
      `${orgPrefix()}/course-instances/${instanceId}/feedback-forms/${formId}/responses`,
    ),
    enabled: !!orgId && !!instanceId && !!formId,
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, formId, ...data }: {
      instanceId: string;
      formId: string;
    } & Record<string, unknown>) =>
      api.post<any>(
        `${orgPrefix()}/course-instances/${instanceId}/feedback-forms/${formId}/responses`,
        data,
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

// ─── Homework ──────────────────────────────────────────────────

export function useHomeworkDefs(instanceId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId, 'homework-defs'],
    queryFn: () => api.get<any[]>(`${orgPrefix()}/course-instances/${instanceId}/homework-defs`),
    enabled: !!orgId && !!instanceId,
  });
}

export function useCreateHomeworkDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: { instanceId: string } & Record<string, unknown>) =>
      api.post<any>(`${orgPrefix()}/course-instances/${instanceId}/homework-defs`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useHomeworkSubmissions(instanceId: string | null, defId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['course-instances', orgId, instanceId, 'homework-defs', defId, 'submissions'],
    queryFn: () => api.get<any[]>(
      `${orgPrefix()}/course-instances/${instanceId}/homework-defs/${defId}/submissions`,
    ),
    enabled: !!orgId && !!instanceId && !!defId,
  });
}

export function useSubmitHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, defId, ...data }: {
      instanceId: string;
      defId: string;
    } & Record<string, unknown>) =>
      api.post<any>(
        `${orgPrefix()}/course-instances/${instanceId}/homework-defs/${defId}/submissions`,
        data,
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}

export function useReviewHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, defId, submissionId, ...data }: {
      instanceId: string;
      defId: string;
      submissionId: string;
    } & Record<string, unknown>) =>
      api.patch<any>(
        `${orgPrefix()}/course-instances/${instanceId}/homework-defs/${defId}/submissions/${submissionId}`,
        data,
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-instances'] }); },
  });
}
