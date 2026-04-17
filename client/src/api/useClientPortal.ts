import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CareEpisode, AssessmentResult, Appointment, CareTimelineEvent } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/client`;
}

/**
 * Phase 14 — Optional `as` query string helper.
 *
 * If `as` is set and not equal to the caller's own user id, we append it as
 * `?as=<uid>` so the server treats the request as "guardian viewing on
 * behalf of <uid>". The server validates the relationship before fulfilling.
 *
 * Many of these hooks are only used inside `packages/client-portal` (which has
 * its own `viewingContext` store). Pages there pass `{ as: viewingAs }`.
 */
function asSuffix(as?: string): string {
  return as ? `?as=${encodeURIComponent(as)}` : '';
}

interface DashboardData {
  episode: CareEpisode | null;
  recentResults: AssessmentResult[];
  upcomingAppointments: Appointment[];
  unreadNotificationCount: number;
}

export function useClientDashboard(opts?: { as?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['clientDashboard', orgId, opts?.as ?? null],
    queryFn: () => api.get<DashboardData>(`${orgPrefix()}/dashboard${asSuffix(opts?.as)}`),
    enabled: !!orgId,
  });
}

export function useMyResults() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myResults', orgId],
    queryFn: () => api.get<AssessmentResult[]>(`${orgPrefix()}/results`),
    enabled: !!orgId,
  });
}

export function useMyAppointments(opts?: { as?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myAppointments', orgId, opts?.as ?? null],
    queryFn: () => api.get<Appointment[]>(`${orgPrefix()}/appointments${asSuffix(opts?.as)}`),
    enabled: !!orgId,
  });
}

export function useMyTimeline() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myTimeline', orgId],
    queryFn: () => api.get<CareTimelineEvent[]>(`${orgPrefix()}/timeline`),
    enabled: !!orgId,
  });
}

export function useAvailableGroups() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['availableGroups', orgId],
    queryFn: () => api.get<{ id: string; title: string; description?: string; startDate?: string; location?: string; capacity?: number }[]>(
      `${orgPrefix()}/groups`,
    ),
    enabled: !!orgId,
  });
}

export function useAvailableCourses() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['availableCourses', orgId],
    queryFn: () => api.get<{ enrollment: any; courseTitle: string; courseCategory?: string }[]>(
      `${orgPrefix()}/my-courses`,
    ),
    enabled: !!orgId,
  });
}

export function useMyAssessments() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myAssessments', orgId],
    queryFn: () => api.get<Array<{
      id: string;
      title: string;
      description?: string;
      completed: boolean;
      context?: { instanceTitle: string; phase: string };
      runnerUrl: string;
    }>>(`${orgPrefix()}/my-assessments`),
    enabled: !!orgId,
  });
}

export function useCounselors(opts?: { as?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['counselors', orgId, opts?.as ?? null],
    queryFn: () => api.get<{ id: string; name: string; avatarUrl?: string }[]>(
      `${orgPrefix()}/counselors${asSuffix(opts?.as)}`,
    ),
    enabled: !!orgId,
  });
}

export function useCreateAppointmentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      counselorId: string;
      startTime: string;
      endTime: string;
      type?: string;
      notes?: string;
    }) => api.post<Appointment>(`${orgPrefix()}/appointment-requests`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myAppointments'] });
      qc.invalidateQueries({ queryKey: ['clientDashboard'] });
    },
  });
}
