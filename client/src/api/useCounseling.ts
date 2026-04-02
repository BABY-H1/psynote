import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CareEpisode, CareTimelineEvent, Appointment, SessionNote, Referral, FollowUpPlan, FollowUpReview } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Org Members ────────────────────────────────────────────────

export function useOrgMembers() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['members', orgId],
    queryFn: () => api.get<{
      id: string;
      userId: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }[]>(`${orgPrefix()}/members`),
    enabled: !!orgId,
  });
}

// ─── Episodes ────────────────────────────────────────────────────

export function useEpisodes(filters?: { counselorId?: string; clientId?: string; status?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['episodes', orgId, filters],
    queryFn: () => api.get<(CareEpisode & { client: { name: string; email: string } })[]>(
      `${orgPrefix()}/episodes${qs ? `?${qs}` : ''}`,
    ),
    enabled: !!orgId,
  });
}

export function useEpisode(episodeId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['episodes', orgId, episodeId],
    queryFn: () => api.get<CareEpisode & { client: { name: string; email: string } }>(
      `${orgPrefix()}/episodes/${episodeId}`,
    ),
    enabled: !!orgId && !!episodeId,
  });
}

export function useTimeline(episodeId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['timeline', orgId, episodeId],
    queryFn: () => api.get<CareTimelineEvent[]>(`${orgPrefix()}/episodes/${episodeId}/timeline`),
    enabled: !!orgId && !!episodeId,
  });
}

export function useCreateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      clientId: string;
      counselorId?: string;
      chiefComplaint?: string;
      currentRisk?: string;
      interventionType?: string;
    }) => api.post<CareEpisode>(`${orgPrefix()}/episodes`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['episodes'] }); },
  });
}

export function useConfirmTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ episodeId, ...data }: {
      episodeId: string;
      currentRisk: string;
      interventionType: string;
      note?: string;
    }) => api.patch<CareEpisode>(`${orgPrefix()}/episodes/${episodeId}/triage`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useCloseEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ episodeId, reason }: { episodeId: string; reason?: string }) =>
      api.post<CareEpisode>(`${orgPrefix()}/episodes/${episodeId}/close`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['episodes'] }); },
  });
}

// ─── Appointments ────────────────────────────────────────────────

export function useAppointments(filters?: { counselorId?: string; clientId?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['appointments', orgId, filters],
    queryFn: () => api.get<{ appointment: Appointment; clientName: string }[]>(
      `${orgPrefix()}/appointments${qs ? `?${qs}` : ''}`,
    ),
    enabled: !!orgId,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      careEpisodeId?: string;
      clientId: string;
      counselorId?: string;
      startTime: string;
      endTime: string;
      type?: string;
      notes?: string;
    }) => api.post<Appointment>(`${orgPrefix()}/appointments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, status }: { appointmentId: string; status: string }) =>
      api.patch<Appointment>(`${orgPrefix()}/appointments/${appointmentId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

// ─── Session Notes ───────────────────────────────────────────────

export function useSessionNotes(filters?: { careEpisodeId?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters?.careEpisodeId) params.set('careEpisodeId', filters.careEpisodeId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['sessionNotes', orgId, filters],
    queryFn: () => api.get<SessionNote[]>(`${orgPrefix()}/session-notes${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

export function useCreateSessionNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      careEpisodeId?: string;
      appointmentId?: string;
      clientId: string;
      sessionDate: string;
      duration?: number;
      sessionType?: string;
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
      summary?: string;
      tags?: string[];
    }) => api.post<SessionNote>(`${orgPrefix()}/session-notes`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessionNotes'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

// ─── Referrals ───────────────────────────────────────────────────

export function useReferrals(careEpisodeId?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qs = careEpisodeId ? `?careEpisodeId=${careEpisodeId}` : '';
  return useQuery({
    queryKey: ['referrals', orgId, careEpisodeId],
    queryFn: () => api.get<Referral[]>(`${orgPrefix()}/referrals${qs}`),
    enabled: !!orgId,
  });
}

export function useCreateReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      careEpisodeId: string;
      clientId: string;
      reason: string;
      riskSummary?: string;
      targetType?: string;
      targetName?: string;
      targetContact?: string;
      followUpPlan?: string;
    }) => api.post<Referral>(`${orgPrefix()}/referrals`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrals'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

// ─── Follow-up ───────────────────────────────────────────────────

export function useFollowUpPlans(careEpisodeId?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qs = careEpisodeId ? `?careEpisodeId=${careEpisodeId}` : '';
  return useQuery({
    queryKey: ['followUpPlans', orgId, careEpisodeId],
    queryFn: () => api.get<FollowUpPlan[]>(`${orgPrefix()}/follow-up/plans${qs}`),
    enabled: !!orgId,
  });
}

export function useCreateFollowUpPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      careEpisodeId: string;
      planType?: string;
      assessmentId?: string;
      frequency?: string;
      nextDue?: string;
      notes?: string;
    }) => api.post<FollowUpPlan>(`${orgPrefix()}/follow-up/plans`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followUpPlans'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useFollowUpReviews(careEpisodeId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['followUpReviews', orgId, careEpisodeId],
    queryFn: () => api.get<FollowUpReview[]>(
      `${orgPrefix()}/follow-up/reviews?careEpisodeId=${careEpisodeId}`,
    ),
    enabled: !!orgId && !!careEpisodeId,
  });
}

export function useCreateFollowUpReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      planId: string;
      careEpisodeId: string;
      resultId?: string;
      riskBefore?: string;
      riskAfter?: string;
      clinicalNote?: string;
      decision?: string;
    }) => api.post<FollowUpReview>(`${orgPrefix()}/follow-up/reviews`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followUpReviews'] });
      qc.invalidateQueries({ queryKey: ['episodes'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}
