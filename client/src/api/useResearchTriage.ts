/**
 * Hooks for the research-triage workspace.
 *
 * Talks to /api/orgs/:orgId/triage/* — list candidates, bucket counts,
 * and the one mutation (override risk level). Action buttons for
 * "accept candidate" / "dismiss" reuse useWorkflow.
 *
 * `mode` picks the data source:
 *   - 'screening' (default): assessment_results of screening assessments
 *   - 'manual': candidate_pool rows added outside the rule engine
 *   - 'all': union of both
 * Intake-type results are NOT here — those live in the GroupInstance /
 * CourseInstance detail pages as per-service 候选 tabs.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export type TriageMode = 'screening' | 'manual' | 'all';

export interface TriageCandidateRow {
  source: 'screening' | 'manual';
  resultId: string | null;
  candidateId: string | null;
  userId: string | null;
  userName: string | null;
  assessmentId: string | null;
  assessmentTitle: string | null;
  assessmentType: string;
  riskLevel: string | null;
  totalScore: string | null;
  batchId: string | null;
  candidateStatus: string | null;
  candidateKind: string | null;
  suggestion: string | null;
  priority: string | null;
  latestEpisodeId: string | null;
  createdAt: string;
}

export interface TriageBuckets {
  level_1: number;
  level_2: number;
  level_3: number;
  level_4: number;
  unrated: number;
}

export interface TriageFilters {
  mode: TriageMode;
  batchId?: string;
  assessmentId?: string;
  level?: string;
}

function orgPrefix() {
  return `/orgs/${useAuthStore.getState().currentOrgId}/triage`;
}

function buildQs(filters: TriageFilters): string {
  const qs = new URLSearchParams();
  qs.set('mode', filters.mode);
  if (filters.batchId) qs.set('batchId', filters.batchId);
  if (filters.assessmentId) qs.set('assessmentId', filters.assessmentId);
  if (filters.level) qs.set('level', filters.level);
  return qs.toString();
}

export function useTriageCandidates(filters: TriageFilters) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['triage-candidates', orgId, filters],
    queryFn: () => {
      const qs = buildQs(filters);
      return api.get<TriageCandidateRow[]>(
        `${orgPrefix()}/candidates${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!orgId,
  });
}

export function useTriageBuckets(
  filters: Pick<TriageFilters, 'batchId' | 'assessmentId'>,
) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['triage-buckets', orgId, filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filters.batchId) qs.set('batchId', filters.batchId);
      if (filters.assessmentId) qs.set('assessmentId', filters.assessmentId);
      const query = qs.toString();
      return api.get<TriageBuckets>(
        `${orgPrefix()}/buckets${query ? `?${query}` : ''}`,
      );
    },
    enabled: !!orgId,
  });
}

export function useUpdateRiskLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, riskLevel, reason }: {
      resultId: string;
      riskLevel: 'level_1' | 'level_2' | 'level_3' | 'level_4';
      reason?: string;
    }) => api.patch(`${orgPrefix()}/results/${resultId}/risk-level`, { riskLevel, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['triage-candidates'] });
      qc.invalidateQueries({ queryKey: ['triage-buckets'] });
    },
  });
}

export type CandidateKind =
  | 'episode_candidate'
  | 'group_candidate'
  | 'course_candidate'
  | 'crisis_candidate';

/**
 * Phase H — BUG-007 真正修复:
 * 把 result 懒转为 candidate_pool 行 (sourceRuleId=null 标记手工创建).
 * 服务端幂等: 同 (resultId, kind, status='pending') 已有候选 → 返回原行.
 * TriageActionBar 在用户点 "转个案 / 课程·团辅 / 忽略" 时先调这个,
 * 保证后续 accept/dismiss 链路有 candidateId 可用.
 */
export function useLazyCreateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, kind, priority }: {
      resultId: string;
      kind: CandidateKind;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
    }) => api.post<{ id: string }>(
      `${orgPrefix()}/results/${resultId}/candidate`,
      { kind, priority },
    ),
    onSuccess: () => {
      // candidate_pool 变了, 让 triage 列表跟 workflow candidate 列表都重取
      qc.invalidateQueries({ queryKey: ['triage-candidates'] });
      qc.invalidateQueries({ queryKey: ['candidate-pool'] });
    },
  });
}
