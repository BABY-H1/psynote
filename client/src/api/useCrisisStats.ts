/**
 * Phase 14c — Shared hook for /api/orgs/:orgId/crisis/stats.
 *
 * Previously inline inside features/collaboration/CrisisDashboardTab.tsx.
 * Extracted so SchoolDashboard / HRDashboardHome / OrgAdminDashboard can
 * reuse the same shape and cache.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface CrisisStats {
  cards: {
    total: number;
    openCount: number;
    pendingCandidateCount: number;   // Phase 14c — candidate_pool pending
    pendingSignOffCount: number;
    closedThisMonth: number;
    reopenedCount: number;
  };
  byCounselor: Array<{
    counselorId: string;
    counselorName: string;
    openCount: number;
    pendingCount: number;
    closedCount: number;
    total: number;
  }>;
  bySource: {
    auto_candidate: number;
    manual: number;
  };
  monthlyTrend: Array<{
    month: string;   // "YYYY-MM"
    opened: number;
    closed: number;
  }>;
  recentActivity: Array<{
    id: string;
    eventType: string;
    title: string | null;
    summary: string | null;
    careEpisodeId: string;
    createdAt: string;
    createdByName: string | null;
    clientName: string | null;
  }>;
  pendingSignOffList: Array<{
    caseId: string;
    episodeId: string;
    submittedAt: string | null;
    counselorName: string | null;
    clientName: string | null;
    closureSummary: string | null;
  }>;
}

export function useCrisisStats() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['crisisStats', orgId],
    queryFn: () => api.get<CrisisStats>(`/orgs/${orgId}/crisis/stats`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}
