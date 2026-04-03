import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function useRunNoteCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      api.post<any>(`${orgPrefix()}/compliance/review-note/${noteId}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['complianceReviews'] }); },
  });
}

export function useRunGoldenThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (episodeId: string) =>
      api.post<any>(`${orgPrefix()}/compliance/review-golden-thread/${episodeId}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['complianceReviews'] }); },
  });
}

export function useRunQualityAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      api.post<any>(`${orgPrefix()}/compliance/review-quality/${noteId}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['complianceReviews'] }); },
  });
}

export function useComplianceReviews(filters?: { careEpisodeId?: string; noteId?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters?.careEpisodeId) params.set('careEpisodeId', filters.careEpisodeId);
  if (filters?.noteId) params.set('noteId', filters.noteId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['complianceReviews', orgId, filters],
    queryFn: () => api.get<any[]>(`${orgPrefix()}/compliance/reviews${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}
