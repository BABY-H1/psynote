/**
 * Phase 14d — React Query hooks for /api/orgs/:orgId/eap/analytics/*.
 *
 * Consumed by the EnterpriseDashboard (enterprise orgType's home page inside
 * the generic AppShell, replacing the old HR-specific shell).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/eap/analytics`;
}

export interface EapOverview {
  totalEmployees: number;
  assessmentsCompleted: number;
  sessionsBooked: number;
  sessionsCompleted: number;
  coursesEnrolled: number;
  groupsParticipated: number;
  crisisFlags: number;
  monthOnly?: boolean;
}

export interface EapRiskDistribution {
  distribution: Array<{
    level: string;   // "level_1" | "level_2" | "level_3" | "level_4" | "unknown"
    count: number;
  }>;
}

export interface EapDepartmentBreakdown {
  departments: Array<{
    name: string;
    employeeCount: number;
    riskDistribution: Record<string, number>;
  }>;
}

export interface EapUsageTrend {
  period: { days: number; since: string };
  data: Array<{
    date: string;
    type: string;
    count: number;
  }>;
}

export interface EapTodos {
  openCrisisCount: number;
  pendingEmployeeBindCount: number;
  subscriptionEndsInDays: number | null;
  subscriptionEndsAt: string | null;
}

export function useEapOverview(opts?: { monthOnly?: boolean }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const q = opts?.monthOnly ? '?month=current' : '';
  return useQuery({
    queryKey: ['eapOverview', orgId, opts?.monthOnly ?? false],
    queryFn: () => api.get<EapOverview>(`${orgPrefix()}/overview${q}`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

export function useEapRiskDistribution() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['eapRiskDistribution', orgId],
    queryFn: () => api.get<EapRiskDistribution>(`${orgPrefix()}/risk-distribution`),
    enabled: !!orgId,
  });
}

export function useEapDepartmentBreakdown() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['eapDepartmentBreakdown', orgId],
    queryFn: () => api.get<EapDepartmentBreakdown>(`${orgPrefix()}/department`),
    enabled: !!orgId,
  });
}

export function useEapUsageTrend(days = 30) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['eapUsageTrend', orgId, days],
    queryFn: () => api.get<EapUsageTrend>(`${orgPrefix()}/usage-trend?days=${days}`),
    enabled: !!orgId,
  });
}

export function useEapTodos() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['eapTodos', orgId],
    queryFn: () => api.get<EapTodos>(`${orgPrefix()}/todos`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

/**
 * Normalize the /risk-distribution response to a strict L1-L4 dict, merging
 * "unknown" level into level_1 (they're likely un-risk-tagged assessments).
 */
export function normalizeRiskDistribution(
  rd: EapRiskDistribution | undefined,
): { level_1: number; level_2: number; level_3: number; level_4: number } {
  const out = { level_1: 0, level_2: 0, level_3: 0, level_4: 0 };
  for (const row of rd?.distribution ?? []) {
    if (row.level in out) {
      (out as any)[row.level] = row.count;
    }
  }
  return out;
}
