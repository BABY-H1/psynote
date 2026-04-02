import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/ai`;
}

/** Interpret assessment results */
export function useInterpretResult() {
  return useMutation({
    mutationFn: (data: {
      scaleName: string;
      dimensions: { name: string; score: number; label: string; riskLevel?: string; advice?: string }[];
      totalScore: number;
      riskLevel?: string;
    }) => api.post<{ interpretation: string }>(`${orgPrefix()}/interpret-result`, data),
  });
}

/** AI risk assessment */
export function useRiskAssess() {
  return useMutation({
    mutationFn: (data: {
      dimensions: { name: string; score: number; label: string; riskLevel?: string }[];
      totalScore: number;
      ruleBasedRisk: string | null;
      chiefComplaint?: string;
    }) => api.post<{
      riskLevel: string;
      confidence: number;
      summary: string;
      factors: string[];
      recommendations: string[];
    }>(`${orgPrefix()}/risk-assess`, data),
  });
}

/** Triage recommendation */
export function useTriageRecommendation() {
  return useMutation({
    mutationFn: (data: {
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      chiefComplaint?: string;
    }) => api.post<{
      interventionType: string;
      reason: string;
      urgency: string;
      additionalSuggestions: string[];
    }>(`${orgPrefix()}/triage`, data),
  });
}

/** SOAP session analysis */
export function useAnalyzeSession() {
  return useMutation({
    mutationFn: (data: {
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
      sessionType?: string;
      duration?: number;
    }) => api.post<{
      summary: string;
      keyThemes: string[];
      progressIndicators: string[];
      riskFlags: string[];
      suggestedFollowUp: string;
    }>(`${orgPrefix()}/analyze-session`, data),
  });
}

/** Progress comparison report */
export function useProgressReport() {
  return useMutation({
    mutationFn: (data: {
      clientName?: string;
      comparisons: {
        date: string;
        totalScore: number;
        riskLevel: string;
        dimensionScores: Record<string, number>;
      }[];
      dimensionNames: Record<string, string>;
      interventionType?: string;
    }) => api.post<{ report: string }>(`${orgPrefix()}/progress-report`, data),
  });
}

/** Referral summary generation */
export function useReferralSummary() {
  return useMutation({
    mutationFn: (data: {
      reason: string;
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      chiefComplaint?: string;
      sessionHistory?: string;
      targetType?: string;
    }) => api.post<{ summary: string }>(`${orgPrefix()}/referral-summary`, data),
  });
}

/** Personalized recommendations */
export function useRecommendations() {
  return useMutation({
    mutationFn: (data: {
      riskLevel: string;
      dimensions: { name: string; score: number; label: string }[];
      interventionType?: string;
      availableCourses?: { id: string; title: string; category: string }[];
      availableGroups?: { id: string; title: string; category: string }[];
    }) => api.post<{
      message: string;
      suggestedCourseIds: string[];
      suggestedGroupIds: string[];
      selfCareAdvice: string[];
    }>(`${orgPrefix()}/recommendations`, data),
  });
}

/** AI-guided scale creation via multi-turn conversation */
export function useCreateScaleChat() {
  return useMutation({
    mutationFn: (data: { messages: { role: 'user' | 'assistant'; content: string }[] }) =>
      api.post<
        | { type: 'message'; content: string }
        | {
            type: 'scale';
            summary: string;
            scale: {
              title: string;
              description: string;
              instructions: string;
              scoringMode: 'sum' | 'average';
              options: { label: string; value: number }[];
              items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
              dimensions: {
                name: string;
                description: string;
                calculationMethod: 'sum' | 'average';
                rules: {
                  minScore: number;
                  maxScore: number;
                  label: string;
                  description: string;
                  advice: string;
                  riskLevel: string;
                }[];
              }[];
            };
          }
      >(`${orgPrefix()}/create-scale-chat`, data),
  });
}

/** Extract scale from text (AI import) */
export function useExtractScale() {
  return useMutation({
    mutationFn: (data: { content: string }) =>
      api.post<{
        title: string;
        description: string;
        instructions: string;
        scoringMode: 'sum' | 'average';
        options: { label: string; value: number }[];
        items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
        dimensions: { name: string; description: string; calculationMethod: 'sum' | 'average' }[];
      }>(`${orgPrefix()}/extract-scale`, data),
  });
}

/** Analyze raw session material → SOAP note */
export function useAnalyzeMaterial() {
  return useMutation({
    mutationFn: (data: {
      content: string;
      inputType?: 'text' | 'transcribed_audio' | 'transcribed_image';
    }) =>
      api.post<{
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
        summary: string;
        tags: string[];
      }>(`${orgPrefix()}/analyze-material`, data),
  });
}

/** Generate full group counseling scheme */
export function useGenerateScheme() {
  return useMutation({
    mutationFn: (data: { prompt: string }) =>
      api.post<{
        title: string;
        description: string;
        theory: string;
        category: string;
        duration: string;
        schedule: string;
        capacity: number;
        sessions: { title: string; goal: string; activities: string; materials: string; duration: string }[];
      }>(`${orgPrefix()}/generate-scheme`, data),
  });
}

/** Generate scheme overall structure (outline only) */
export function useGenerateSchemeOverall() {
  return useMutation({
    mutationFn: (data: { prompt: string }) =>
      api.post<{
        title: string;
        description: string;
        theory: string;
        category: string;
        sessions: { title: string; goal: string; duration: string }[];
      }>(`${orgPrefix()}/generate-scheme-overall`, data),
  });
}

/** Generate detailed activities for a single session */
export function useGenerateSessionDetail() {
  return useMutation({
    mutationFn: (data: {
      overallScheme: Record<string, unknown>;
      sessionIndex: number;
      prompt: string;
    }) =>
      api.post<{ activities: string; materials: string }>(`${orgPrefix()}/generate-session-detail`, data),
  });
}

/** Refine scheme overall structure */
export function useRefineSchemeOverall() {
  return useMutation({
    mutationFn: (data: {
      currentScheme: Record<string, unknown>;
      instruction: string;
    }) => api.post<Record<string, unknown>>(`${orgPrefix()}/refine-scheme-overall`, data),
  });
}

/** Refine a specific session's details */
export function useRefineSessionDetail() {
  return useMutation({
    mutationFn: (data: {
      currentSession: Record<string, unknown>;
      overallScheme: Record<string, unknown>;
      sessionIndex: number;
      instruction: string;
    }) => api.post<Record<string, unknown>>(`${orgPrefix()}/refine-session-detail`, data),
  });
}

/** General content refinement */
export function useRefineContent() {
  return useMutation({
    mutationFn: (data: { content: string; instruction: string }) =>
      api.post<{ refined: string }>(`${orgPrefix()}/refine`, data),
  });
}
