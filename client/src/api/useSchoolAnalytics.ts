/**
 * Phase 14c — React Query hooks for /api/orgs/:orgId/school/analytics/*.
 *
 * Consumed by the redesigned SchoolDashboard. Each hook is independently
 * cached (different query keys) so pages can mount them selectively.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface SchoolOverview {
  assessmentsThisMonth: number;
  riskLevelDistribution: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  openCrisisCount: number;
  pendingSignOffCount: number;
}

export interface ClassRiskRow {
  grade: string;
  className: string;
  riskCounts: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  totalAssessed: number;
  totalStudents: number;
}

export interface HighRiskStudent {
  userId: string;
  name: string;
  studentId: string | null;
  grade: string | null;
  className: string | null;
  riskLevel: 'level_3' | 'level_4';
  latestAssessmentAt: string | null;
  hasOpenCrisis: boolean;
}

export interface ClassCrisisRow {
  grade: string;
  className: string;
  openCount: number;
  pendingSignOffCount: number;
  closedCount: number;
  total: number;
}

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/school/analytics`;
}

export function useSchoolOverview() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['schoolOverview', orgId],
    queryFn: () => api.get<SchoolOverview>(`${orgPrefix()}/overview`),
    enabled: !!orgId,
    refetchInterval: 60_000, // refresh every minute
  });
}

export function useClassRiskMatrix() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['classRiskMatrix', orgId],
    queryFn: () => api.get<ClassRiskRow[]>(`${orgPrefix()}/risk-by-class`),
    enabled: !!orgId,
  });
}

export function useHighRiskStudents(limit = 50) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['highRiskStudents', orgId, limit],
    queryFn: () =>
      api.get<HighRiskStudent[]>(`${orgPrefix()}/high-risk-students?limit=${limit}`),
    enabled: !!orgId,
  });
}

export function useCrisisByClass() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['crisisByClass', orgId],
    queryFn: () => api.get<ClassCrisisRow[]>(`${orgPrefix()}/crisis-by-class`),
    enabled: !!orgId,
  });
}
