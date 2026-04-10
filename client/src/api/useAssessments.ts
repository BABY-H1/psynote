import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Assessment, AssessmentResult, AssessmentBatch, AssessmentReport, AssessmentBlock, Distribution } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Assessments ─────────────────────────────────────────────────

export function useAssessments() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['assessments', orgId],
    queryFn: () => api.get<Assessment[]>(`${orgPrefix()}/assessments`),
    enabled: !!orgId,
  });
}

export function useAssessment(assessmentId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['assessments', orgId, assessmentId],
    queryFn: () => api.get<Assessment & { scales: { id: string; title: string; sortOrder: number }[] }>(
      `${orgPrefix()}/assessments/${assessmentId}`,
    ),
    enabled: !!orgId && !!assessmentId,
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      assessmentType?: string;
      demographics?: unknown[];
      blocks?: AssessmentBlock[];
      screeningRules?: unknown;
      collectMode?: string;
      resultDisplay?: { mode: string; show: string[] };
      status?: string;
      scaleIds?: string[];
    }) => api.post<Assessment>(`${orgPrefix()}/assessments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
    },
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, ...data }: { assessmentId: string } & Partial<{
      title: string;
      description: string;
      demographics: unknown[];
      blocks: AssessmentBlock[];
      collectMode: string;
      resultDisplay: { mode: string; show: string[] };
      isActive: boolean;
      scaleIds: string[];
    }>) => api.patch<Assessment>(`${orgPrefix()}/assessments/${assessmentId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
    },
  });
}

export function useDeleteAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: string) => api.delete(`${orgPrefix()}/assessments/${assessmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
    },
  });
}

// ─── Results ─────────────────────────────────────────────────────

export function useResults(filters?: {
  assessmentId?: string;
  userId?: string;
  careEpisodeId?: string;
  batchId?: string;
  riskLevel?: string;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['results', orgId, filters],
    queryFn: () => api.get<AssessmentResult[]>(`${orgPrefix()}/results${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

export function useResult(resultId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['results', orgId, resultId],
    queryFn: () => api.get<AssessmentResult>(`${orgPrefix()}/results/${resultId}`),
    enabled: !!orgId && !!resultId,
  });
}

// ─── Phase 9β — MBC trajectory, client visibility, recommendations ────

export interface TrajectoryPoint {
  id: string;
  assessmentId: string;
  totalScore: number | string | null;
  riskLevel: string | null;
  dimensionScores: Record<string, number> | unknown;
  clientVisible: boolean;
  createdAt: string;
}

/**
 * Time-ordered series of (score, risk, dimensions) for one client × one scale.
 * Powers the longitudinal chart.
 */
export function useTrajectory(userId: string | undefined, scaleId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['trajectory', orgId, userId, scaleId],
    queryFn: () =>
      api.get<TrajectoryPoint[]>(
        `${orgPrefix()}/results/trajectory?userId=${userId}&scaleId=${scaleId}`,
      ),
    enabled: !!orgId && !!userId && !!scaleId,
  });
}

/**
 * Toggle a single result's `clientVisible` flag.
 * Default is false; counselor flips it on per result.
 */
export function useSetResultClientVisible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, visible }: { resultId: string; visible: boolean }) =>
      api.patch<AssessmentResult>(
        `${orgPrefix()}/results/${resultId}/client-visible`,
        { visible },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['results'] });
      qc.invalidateQueries({ queryKey: ['trajectory'] });
    },
  });
}

/** Persist AI triage recommendations on a result row. */
export function useSetResultRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, recommendations }: { resultId: string; recommendations: unknown[] }) =>
      api.patch<AssessmentResult>(
        `${orgPrefix()}/results/${resultId}/recommendations`,
        { recommendations },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['results'] });
    },
  });
}

export function useSubmitResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      assessmentId: string;
      userId?: string;
      careEpisodeId?: string;
      batchId?: string;
      demographicData?: Record<string, unknown>;
      answers: Record<string, number>;
    }) => api.post<AssessmentResult>(`${orgPrefix()}/results`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['results'] });
    },
  });
}

/** Public (no-auth) submission for anonymous assessments */
export function usePublicSubmit() {
  return useMutation({
    mutationFn: (data: {
      assessmentId: string;
      demographicData?: Record<string, unknown>;
      answers: Record<string, number>;
      customAnswers?: Record<string, unknown>;
    }) => api.post<AssessmentResult>(
      `/public/assessments/${data.assessmentId}/submit`,
      {
        demographicData: data.demographicData,
        answers: data.answers,
        customAnswers: data.customAnswers,
      },
    ),
  });
}

// ─── Distributions ──────────────────────────────────────────────

export function useDistributions(assessmentId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['distributions', orgId, assessmentId],
    queryFn: () => api.get<Distribution[]>(`${orgPrefix()}/assessments/${assessmentId}/distributions`),
    enabled: !!orgId && !!assessmentId,
  });
}

export function useCreateDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, ...data }: {
      assessmentId: string;
      mode?: string;
      batchLabel?: string;
      targets?: unknown[];
      schedule?: unknown;
    }) => api.post<Distribution>(`${orgPrefix()}/assessments/${assessmentId}/distributions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] });
    },
  });
}

// ─── Batches ─────────────────────────────────────────────────────

export function useBatches() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['batches', orgId],
    queryFn: () => api.get<AssessmentBatch[]>(`${orgPrefix()}/assessment-batches`),
    enabled: !!orgId,
  });
}

export function useBatch(batchId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['batches', orgId, batchId],
    queryFn: () => api.get<AssessmentBatch>(`${orgPrefix()}/assessment-batches/${batchId}`),
    enabled: !!orgId && !!batchId,
  });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      assessmentId: string;
      title: string;
      targetType?: string;
      targetConfig?: Record<string, unknown>;
      deadline?: string;
      totalTargets: number;
    }) => api.post<AssessmentBatch>(`${orgPrefix()}/assessment-batches`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

// ─── Reports ─────────────────────────────────────────────────────

export function useReports() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['reports', orgId],
    queryFn: () => api.get<AssessmentReport[]>(`${orgPrefix()}/reports`),
    enabled: !!orgId,
  });
}

export function useReport(reportId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['reports', orgId, reportId],
    queryFn: () => api.get<AssessmentReport>(`${orgPrefix()}/reports/${reportId}`),
    enabled: !!orgId && !!reportId,
  });
}

export function useUpdateReportNarrative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, narrative }: { reportId: string; narrative: string }) =>
      api.patch<AssessmentReport>(`${orgPrefix()}/reports/${reportId}/narrative`, { narrative }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); },
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      reportType: string;
      resultId?: string;
      resultIds?: string[];
      title?: string;
    }) => api.post<AssessmentReport>(`${orgPrefix()}/reports`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
