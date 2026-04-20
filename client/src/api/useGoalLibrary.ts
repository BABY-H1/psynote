import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TreatmentGoalLibraryItem } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import { libraryApi, libraryScopeKey } from '../shared/api/libraryScope';

export function useGoalLibrary(filters?: { problemArea?: string; category?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
  const params = new URLSearchParams();
  if (filters?.problemArea) params.set('problemArea', filters.problemArea);
  if (filters?.category) params.set('category', filters.category);
  const qs = params.toString();
  return useQuery({
    queryKey: ['goalLibrary', libraryScopeKey(), filters],
    queryFn: () => api.get<TreatmentGoalLibraryItem[]>(`${libraryApi('goals')}${qs ? `?${qs}` : ''}`),
    enabled: !!orgId || isSystemAdmin,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string; description?: string; problemArea: string; category?: string;
      objectivesTemplate?: string[]; interventionSuggestions?: string[]; visibility?: string;
    }) => api.post<TreatmentGoalLibraryItem>(libraryApi('goals'), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, ...data }: { goalId: string } & Partial<{
      title: string; description: string; problemArea: string; category: string;
      objectivesTemplate: string[]; interventionSuggestions: string[]; visibility: string;
    }>) => api.patch<TreatmentGoalLibraryItem>(`${libraryApi('goals')}/${goalId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => api.delete(`${libraryApi('goals')}/${goalId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goalLibrary'] }); },
  });
}
