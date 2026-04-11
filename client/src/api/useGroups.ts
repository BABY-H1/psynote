import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { GroupScheme, GroupInstance, GroupEnrollment, GroupSessionRecord, AssessmentConfig } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Schemes ─────────────────────────────────────────────────────

export function useGroupSchemes() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['groupSchemes', orgId],
    queryFn: () => api.get<GroupScheme[]>(`${orgPrefix()}/group-schemes`),
    enabled: !!orgId,
  });
}

export function useGroupScheme(schemeId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['groupSchemes', orgId, schemeId],
    queryFn: () => api.get<GroupScheme>(`${orgPrefix()}/group-schemes/${schemeId}`),
    enabled: !!orgId && !!schemeId,
  });
}

export function useCreateGroupScheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<GroupScheme>(`${orgPrefix()}/group-schemes`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSchemes'] }); },
  });
}

export function useUpdateGroupScheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ schemeId, ...data }: { schemeId: string } & Record<string, unknown>) =>
      api.patch<GroupScheme>(`${orgPrefix()}/group-schemes/${schemeId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSchemes'] }); },
  });
}

export function useDeleteGroupScheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schemeId: string) => api.delete(`${orgPrefix()}/group-schemes/${schemeId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSchemes'] }); },
  });
}

// ─── Instances ───────────────────────────────────────────────────

export function useGroupInstances(status?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['groupInstances', orgId, status],
    queryFn: () => api.get<GroupInstance[]>(`${orgPrefix()}/group-instances${qs}`),
    enabled: !!orgId,
  });
}

export function useGroupInstance(instanceId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['groupInstances', orgId, instanceId],
    queryFn: () => api.get<GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] }>(
      `${orgPrefix()}/group-instances/${instanceId}`,
    ),
    enabled: !!orgId && !!instanceId,
  });
}

export function useCreateGroupInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      schemeId?: string;
      title: string;
      description?: string;
      category?: string;
      leaderId?: string;
      schedule?: string;
      duration?: string;
      startDate?: string;
      location?: string;
      status?: string;
      capacity?: number;
      recruitmentAssessments?: string[];
      overallAssessments?: string[];
      screeningNotes?: string;
      assessmentConfig?: AssessmentConfig;
    }) => api.post<GroupInstance>(`${orgPrefix()}/group-instances`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

export function useUpdateGroupInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: { instanceId: string } & Partial<{
      title: string; description: string; location: string; schedule: string;
      duration: string; startDate: string; leaderId: string;
      status: string; capacity: number;
      recruitmentAssessments: string[]; overallAssessments: string[]; screeningNotes: string;
      assessmentConfig: AssessmentConfig;
    }>) => api.patch<GroupInstance>(`${orgPrefix()}/group-instances/${instanceId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

export function useDeleteGroupInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => api.delete(`${orgPrefix()}/group-instances/${instanceId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

export function useEnrollInGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: {
      instanceId: string;
      careEpisodeId?: string;
      screeningResultId?: string;
    }) => api.post<GroupEnrollment>(`${orgPrefix()}/group-instances/${instanceId}/enroll`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

export function useUpdateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, status }: { enrollmentId: string; status: string }) =>
      api.patch<GroupEnrollment>(`${orgPrefix()}/group-instances/enrollments/${enrollmentId}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

// ─── Session Records ────────────────────────────────────────────

export function useGroupSessions(instanceId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['groupSessions', orgId, instanceId],
    queryFn: () => api.get<GroupSessionRecord[]>(`${orgPrefix()}/group-instances/${instanceId}/sessions`),
    enabled: !!orgId && !!instanceId,
  });
}

export function useInitializeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.post<GroupSessionRecord[]>(`${orgPrefix()}/group-instances/${instanceId}/sessions/init`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSessions'] }); },
  });
}

export function useCreateSessionRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: {
      instanceId: string;
      title: string;
      sessionNumber: number;
      date?: string;
    }) => api.post<GroupSessionRecord>(`${orgPrefix()}/group-instances/${instanceId}/sessions`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSessions'] }); },
  });
}

export function useUpdateSessionRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, sessionId, ...data }: {
      instanceId: string;
      sessionId: string;
      status?: string;
      date?: string;
      notes?: string;
    }) => api.patch<GroupSessionRecord>(
      `${orgPrefix()}/group-instances/${instanceId}/sessions/${sessionId}`,
      data,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupSessions'] }); },
  });
}

export function useRecordAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, sessionId, attendances }: {
      instanceId: string;
      sessionId: string;
      attendances: { enrollmentId: string; status: string; note?: string }[];
    }) => api.post(
      `${orgPrefix()}/group-instances/${instanceId}/sessions/${sessionId}/attendance`,
      { attendances },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groupSessions'] });
      qc.invalidateQueries({ queryKey: ['attendanceSummary'] });
    },
  });
}

export function useAttendanceSummary(instanceId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['attendanceSummary', orgId, instanceId],
    queryFn: () => api.get<Record<string, { present: number; total: number }>>(
      `${orgPrefix()}/group-instances/${instanceId}/attendance-summary`,
    ),
    enabled: !!orgId && !!instanceId,
  });
}

// ─── Batch Enrollment ──────────────────────────────────────────

export function useBulkEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, members }: {
      instanceId: string;
      members: Array<{ userId?: string; name?: string; email?: string; phone?: string }>;
    }) => api.post<{ enrolled: number; errors: Array<{ index: number; message: string }> }>(
      `${orgPrefix()}/group-instances/${instanceId}/enroll-batch`,
      { members },
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

/** Fetch session detail with attendance for real-time check-in polling */
export function useSessionAttendance(instanceId: string | undefined, sessionId: string | undefined, pollInterval?: number) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['sessionAttendance', orgId, instanceId, sessionId],
    queryFn: () => api.get<GroupSessionRecord>(
      `${orgPrefix()}/group-instances/${instanceId}/sessions/${sessionId}`,
    ),
    enabled: !!orgId && !!instanceId && !!sessionId,
    refetchInterval: pollInterval || false,
  });
}
