import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { GroupScheme, GroupInstance, GroupEnrollment } from '@psynote/shared';
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
    mutationFn: (data: {
      title: string;
      description?: string;
      theory?: string;
      category?: string;
      tags?: string[];
      sessions?: { title: string; goal?: string; activities?: string; materials?: string; duration?: string }[];
    }) => api.post<GroupScheme>(`${orgPrefix()}/group-schemes`, data),
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
      capacity?: number;
      screeningAssessmentId?: string;
    }) => api.post<GroupInstance>(`${orgPrefix()}/group-instances`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupInstances'] }); },
  });
}

export function useUpdateGroupInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...data }: { instanceId: string } & Partial<{
      title: string; status: string; capacity: number;
    }>) => api.patch<GroupInstance>(`${orgPrefix()}/group-instances/${instanceId}`, data),
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
