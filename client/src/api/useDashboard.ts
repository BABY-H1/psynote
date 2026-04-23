/**
 * Hooks for /orgs/:orgId/dashboard/* routes.
 *
 * - `useDashboardStats()` — snapshot counts (used by OrgAdmin / School / Enterprise)
 * - `useDashboardKpiDelta()` — 5 month-flow KPIs with previous-window comparison
 *   (used by OrgAdmin for environmental-comparison tiles)
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface DashboardStats {
  counselorCount: number;
  clientCount: number;
  monthlySessionCount: number;
  unassignedCount: number;
  activeGroupCount: number;
  activeCourseCount: number;
  monthlyAssessmentCount: number;
}

export interface KpiDeltaEntry {
  current: number;
  previous: number;
}

export interface DashboardKpiDelta {
  newClient: KpiDeltaEntry;
  session: KpiDeltaEntry;
  groupActive: KpiDeltaEntry;
  courseActive: KpiDeltaEntry;
  assessment: KpiDeltaEntry;
}

export function useDashboardStats() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['dashboard-stats', orgId],
    queryFn: () => api.get<DashboardStats>(`/orgs/${orgId}/dashboard/stats`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

export function useDashboardKpiDelta(window: 'month' | 'week' = 'month') {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['dashboard-kpi-delta', orgId, window],
    queryFn: () => api.get<DashboardKpiDelta>(`/orgs/${orgId}/dashboard/kpi-delta?window=${window}`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}
