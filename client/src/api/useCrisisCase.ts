/**
 * Hooks for crisis handling cases — Phase 13.
 *
 * Mirrors server routes at /api/orgs/:orgId/crisis.
 *
 * The "accept a crisis candidate" call lives in useWorkflow (since the
 * endpoint is under /workflow/candidates/:id/accept); this file exposes
 * everything that happens *after* accept — loading the case, updating
 * checklist steps, and submitting/signing off.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import type {
  CrisisCase,
  CrisisCaseStage,
  CrisisChecklistStepKey,
  ReinterviewStep,
  ParentContactStep,
  DocumentsStep,
  ReferralStep,
  FollowUpStep,
} from '@psynote/shared';

function orgPrefix() {
  return `/orgs/${useAuthStore.getState().currentOrgId}/crisis`;
}

export function useCrisisCases(filters?: { stage?: CrisisCaseStage }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qs = new URLSearchParams();
  if (filters?.stage) qs.set('stage', filters.stage);
  return useQuery({
    queryKey: ['crisis-cases', orgId, filters?.stage],
    queryFn: () => api.get<CrisisCase[]>(`${orgPrefix()}/cases?${qs.toString()}`),
    enabled: !!orgId,
  });
}

export function useCrisisCase(caseId: string | null | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['crisis-case', orgId, caseId],
    queryFn: () => api.get<CrisisCase>(`${orgPrefix()}/cases/${caseId}`),
    enabled: !!orgId && !!caseId,
  });
}

/**
 * Look up the crisis case for a given episode.
 * Returns null when the episode is NOT a crisis case (the hook is safe to
 * call unconditionally inside EpisodeDetail — non-crisis episodes just get
 * `null` back and the CrisisChecklistPanel is not shown).
 */
export function useCrisisCaseByEpisode(episodeId: string | null | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['crisis-case-by-episode', orgId, episodeId],
    queryFn: () => api.get<CrisisCase | null>(`${orgPrefix()}/cases/by-episode/${episodeId}`),
    enabled: !!orgId && !!episodeId,
  });
}

type StepPayload = Partial<ReinterviewStep & ParentContactStep & DocumentsStep & ReferralStep & FollowUpStep>;

export function useUpdateCrisisChecklistStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, stepKey, payload }: {
      caseId: string;
      stepKey: CrisisChecklistStepKey;
      payload: StepPayload;
    }) => api.put<CrisisCase>(`${orgPrefix()}/cases/${caseId}/checklist/${stepKey}`, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crisis-case'] });
      qc.invalidateQueries({ queryKey: ['crisis-case-by-episode'] });
      qc.invalidateQueries({ queryKey: ['crisis-cases'] });
      qc.invalidateQueries({ queryKey: ['enriched-timeline'] });
    },
  });
}

export function useSubmitCrisisForSignOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, closureSummary }: { caseId: string; closureSummary: string }) =>
      api.post<CrisisCase>(`${orgPrefix()}/cases/${caseId}/submit`, { closureSummary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crisis-case'] });
      qc.invalidateQueries({ queryKey: ['crisis-case-by-episode'] });
      qc.invalidateQueries({ queryKey: ['crisis-cases'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSignOffCrisisCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, approve, supervisorNote }: {
      caseId: string;
      approve: boolean;
      supervisorNote?: string;
    }) => api.post<CrisisCase>(`${orgPrefix()}/cases/${caseId}/sign-off`, { approve, supervisorNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crisis-case'] });
      qc.invalidateQueries({ queryKey: ['crisis-case-by-episode'] });
      qc.invalidateQueries({ queryKey: ['crisis-cases'] });
      qc.invalidateQueries({ queryKey: ['episode'] });
      qc.invalidateQueries({ queryKey: ['episodes'] });
    },
  });
}
