import { useQuery } from '@tanstack/react-query';
import type { CareEpisode, AssessmentResult, Appointment, CareTimelineEvent } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/client`;
}

interface DashboardData {
  episode: CareEpisode | null;
  recentResults: AssessmentResult[];
  upcomingAppointments: Appointment[];
  unreadNotificationCount: number;
}

export function useClientDashboard() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['clientDashboard', orgId],
    queryFn: () => api.get<DashboardData>(`${orgPrefix()}/dashboard`),
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

export function useMyAppointments() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myAppointments', orgId],
    queryFn: () => api.get<Appointment[]>(`${orgPrefix()}/appointments`),
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
    queryFn: () => api.get<{ id: string; title: string; description?: string; category?: string }[]>(
      `${orgPrefix()}/courses`,
    ),
    enabled: !!orgId,
  });
}
