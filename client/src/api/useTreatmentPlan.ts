import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TreatmentPlan } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function useTreatmentPlans(careEpisodeId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['treatmentPlans', orgId, careEpisodeId],
    queryFn: () =>
      api.get<TreatmentPlan[]>(`${orgPrefix()}/treatment-plans?careEpisodeId=${careEpisodeId}`),
    enabled: !!orgId && !!careEpisodeId,
  });
}

export function useCreateTreatmentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      careEpisodeId: string;
      title?: string;
      approach?: string;
      goals?: unknown[];
      interventions?: unknown[];
      sessionPlan?: string;
      progressNotes?: string;
      reviewDate?: string;
      status?: string;
    }) => api.post<TreatmentPlan>(`${orgPrefix()}/treatment-plans`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatmentPlans'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useUpdateTreatmentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      ...data
    }: {
      planId: string;
      title?: string;
      approach?: string;
      goals?: unknown[];
      interventions?: unknown[];
      sessionPlan?: string;
      progressNotes?: string;
      reviewDate?: string;
      status?: string;
    }) => api.patch<TreatmentPlan>(`${orgPrefix()}/treatment-plans/${planId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatmentPlans'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useUpdateGoalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, goalId, status }: { planId: string; goalId: string; status: string }) =>
      api.patch<TreatmentPlan>(`${orgPrefix()}/treatment-plans/${planId}/goals/${goalId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatmentPlans'] });
    },
  });
}
