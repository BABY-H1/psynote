import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Assessment, AssessmentResult, AssessmentBatch, AssessmentReport, AssessmentBlock } from '@psynote/shared';
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
