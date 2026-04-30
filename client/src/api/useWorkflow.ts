/**
 * Hooks for the workflow rule engine — rules CRUD + candidate pool.
 *
 * Mirrors server routes registered at /api/orgs/:orgId/workflow.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import type {
  WorkflowRule,
  WorkflowCondition,
  WorkflowAction,
  CandidateEntry,
  WorkflowExecution,
} from '@psynote/shared';

function orgPrefix() {
  return `/orgs/${useAuthStore.getState().currentOrgId}/workflow`;
}

// ─── Rules ───────────────────────────────────────────────────────

export function useWorkflowRules() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['workflow-rules', orgId],
    queryFn: () => api.get<WorkflowRule[]>(`${orgPrefix()}/rules`),
    enabled: !!orgId,
  });
}

export function useWorkflowRule(ruleId: string | null) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['workflow-rule', orgId, ruleId],
    queryFn: () => api.get<WorkflowRule>(`${orgPrefix()}/rules/${ruleId}`),
    enabled: !!orgId && !!ruleId,
  });
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  triggerEvent: string;
  conditions?: WorkflowCondition[];
  actions?: WorkflowAction[];
  isActive?: boolean;
  priority?: number;
}

export function useCreateWorkflowRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRuleInput) => api.post<WorkflowRule>(`${orgPrefix()}/rules`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-rules'] }); },
  });
}

export function useUpdateWorkflowRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, ...data }: { ruleId: string } & Partial<CreateRuleInput>) =>
      api.patch(`${orgPrefix()}/rules/${ruleId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-rules'] }); },
  });
}

export function useDeleteWorkflowRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => api.delete(`${orgPrefix()}/rules/${ruleId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-rules'] }); },
  });
}

export function useWorkflowExecutions(ruleId?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['workflow-executions', orgId, ruleId],
    queryFn: () => {
      const q = ruleId ? `?ruleId=${ruleId}` : '';
      return api.get<WorkflowExecution[]>(`${orgPrefix()}/executions${q}`);
    },
    enabled: !!orgId,
  });
}

// ─── Candidate Pool ──────────────────────────────────────────────
//
// useCandidatePool removed — the old协作中心/待处理候选 Tab has been
// superseded by the /research-triage workspace, which drives from
// assessment_results directly. Accept/dismiss mutations below are still
// used (by TriageActionBar) since every candidate_pool row is created
// by the rule engine tied to a screening/intake result.

export function useAcceptCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; resolvedRefType?: string; resolvedRefId?: string; note?: string }) =>
      api.post<CandidateEntry>(`${orgPrefix()}/candidates/${id}/accept`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['candidate-pool'] }); },
  });
}

export function useDismissCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<CandidateEntry>(`${orgPrefix()}/candidates/${id}/dismiss`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['candidate-pool'] }); },
  });
}

// ─── Assessment-scoped rules ─────────────────────────────────────

/**
 * Bulk replace all wizard-authored rules for a given assessment.
 * Preserves manually-authored rules scoped to the same assessment.
 */
export function useSyncRulesByAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, rules }: {
      assessmentId: string;
      rules: Array<{
        name: string;
        description?: string;
        conditions: WorkflowCondition[];
        actions: WorkflowAction[];
        isActive?: boolean;
        priority?: number;
      }>;
    }) => api.put<{ count: number }>(`${orgPrefix()}/rules/by-assessment/${assessmentId}`, { rules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-rules'] });
    },
  });
}

export function useRulesByAssessment(assessmentId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['workflow-rules-by-assessment', orgId, assessmentId],
    queryFn: () => api.get<WorkflowRule[]>(`${orgPrefix()}/rules/by-assessment/${assessmentId}`),
    enabled: !!orgId && !!assessmentId,
  });
}
