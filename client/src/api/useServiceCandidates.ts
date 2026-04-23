/**
 * Hook for "candidates queued for this group/course instance".
 *
 * Backend routes:
 *   GET /api/orgs/:orgId/group-instances/:id/candidates
 *   GET /api/orgs/:orgId/course-instances/:id/candidates
 *
 * Accept / dismiss reuse useAcceptCandidate / useDismissCandidate in
 * useWorkflow.ts (unchanged surface).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface ServiceCandidate {
  candidateId: string;
  kind: string;
  userId: string;
  userName: string | null;
  suggestion: string;
  reason: string | null;
  priority: string;
  status: string;
  sourceResultId: string | null;
  sourceRuleId: string | null;
  createdAt: string;
}

export type ServiceCandidateType = 'group' | 'course';

export function useServiceCandidates(
  serviceType: ServiceCandidateType,
  instanceId: string | undefined,
  status?: string,
) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const prefix = serviceType === 'group' ? 'group-instances' : 'course-instances';
  return useQuery({
    queryKey: ['service-candidates', serviceType, orgId, instanceId, status],
    queryFn: () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return api.get<ServiceCandidate[]>(
        `/orgs/${orgId}/${prefix}/${instanceId}/candidates${qs}`,
      );
    },
    enabled: !!orgId && !!instanceId,
  });
}
