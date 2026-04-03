import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TreatmentGoalLibraryItem } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function useGoalLibrary(filters?: { problemArea?: string; category?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters?.problemArea) params.set('problemArea', filters.problemArea);
  if (filters?.category) params.set('category', filters.category);
  const qs = params.toString();
  return useQuery({
    queryKey: ['goalLibrary', orgId, filters],
    queryFn: () => api.get<TreatmentGoalLibraryItem[]>(`${orgPrefix()}/goal-library${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string; description?: string; problemArea: string; category?: string;
      objectivesTemplate?: string[]; interventionSuggestions?: string[]; visibility?: string;
    }) => api.post<TreatmentGoalLibraryItem>(`${orgPrefix()}/goal-library`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, ...data }: { goalId: string } & Partial<{
      title: string; description: string; problemArea: string; category: string;
      objectivesTemplate: string[]; interventionSuggestions: string[]; visibility: string;
    }>) => api.patch<TreatmentGoalLibraryItem>(`${orgPrefix()}/goal-library/${goalId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => api.delete(`${orgPrefix()}/goal-library/${goalId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}
