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

/** Suggest treatment plan goals and interventions */
export function useSuggestTreatmentPlan() {
  return useMutation({
    mutationFn: (data: {
      chiefComplaint?: string;
      assessmentSummary?: string;
      sessionNotes?: string;
      clientContext?: {
        name?: string;
        age?: number;
        gender?: string;
        presentingIssues?: string[];
      };
    }) => api.post<{
      suggestedGoals: { description: string; rationale: string }[];
      suggestedInterventions: { description: string; frequency?: string; rationale: string }[];
      sessionPlanSuggestion: string;
      rationale: string;
    }>(`${orgPrefix()}/suggest-treatment-plan`, data),
  });
}

/** AI client summary / risk profile */
export function useClientAISummary() {
  return useMutation({
    mutationFn: (data: { clientId: string; episodeId: string }) =>
      api.post<{
        overview: string;
        keyThemes: string[];
        riskProfile: {
          currentLevel: string;
          trend: 'improving' | 'stable' | 'worsening';
          factors: string[];
          protectiveFactors: string[];
        };
        treatmentProgress: string;
        recommendations: string[];
      }>(`${orgPrefix()}/client-summary`, data),
  });
}

/** AI case progress report */
export function useCaseProgressReport() {
  return useMutation({
    mutationFn: (data: { episodeId: string }) =>
      api.post<{
        reportPeriod: { from: string; to: string };
        sessionSummary: { totalSessions: number; keyProgressPoints: string[] };
        assessmentChanges: { trend: 'improving' | 'stable' | 'worsening'; details: string };
        goalProgress: { goalDescription: string; status: string; notes: string }[];
        riskAssessment: { currentLevel: string; trend: string };
        narrative: string;
        recommendations: string[];
      }>(`${orgPrefix()}/case-progress-report`, data),
  });
}

/** Format-aware material analysis */
export function useAnalyzeMaterialFormatted() {
  return useMutation({
    mutationFn: (data: {
      content: string;
      format: string;
      fieldDefinitions: { key: string; label: string }[];
      inputType?: string;
    }) => api.post<Record<string, string>>(`${orgPrefix()}/analyze-material-formatted`, data),
  });
}

/** Conversational note guidance chat */
export function useNoteGuidanceChat() {
  return useMutation({
    mutationFn: (data: {
      messages: { role: 'user' | 'assistant'; content: string }[];
      context: {
        format: string;
        fieldDefinitions: { key: string; label: string }[];
        clientContext?: { chiefComplaint?: string; treatmentGoals?: string[]; previousNoteSummary?: string; name?: string; age?: number; gender?: string; presentingIssues?: string[] };
        currentFields?: Record<string, string>;
        attachmentTexts?: string[];
      };
    }) => api.post<
      | { type: 'message'; content: string }
      | { type: 'suggestion'; field: string; fieldLabel: string; content: string; rationale: string }
      | { type: 'complete'; fields: Record<string, string>; summary: string }
    >(`${orgPrefix()}/note-guidance-chat`, data),
  });
}

/** Simulated client conversation */
export function useSimulatedClient() {
  return useMutation({
    mutationFn: (data: { messages: { role: string; content: string }[]; context: any }) =>
      api.post<{ type: 'message'; content: string }>(`${orgPrefix()}/simulated-client`, data),
  });
}

/** Supervision conversation */
export function useSupervision() {
  return useMutation({
    mutationFn: (data: { messages: { role: string; content: string }[]; context: any }) =>
      api.post<{ type: 'message'; content: string }>(`${orgPrefix()}/supervision`, data),
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

/** AI-guided screening rules configuration */
export function useConfigureScreeningRules() {
  return useMutation({
    mutationFn: (data: {
      messages: { role: 'user' | 'assistant'; content: string }[];
      context: {
        assessmentType: string;
        scales: {
          id: string;
          title: string;
          dimensions: { id: string; name: string; rules?: { minScore: number; maxScore: number; label: string; riskLevel?: string }[] }[];
          items: { id: string; text: string; options: { label: string; value: number }[] }[];
        }[];
      };
    }) =>
      api.post<
        | { type: 'message'; content: string }
        | { type: 'rules'; summary: string; rules: { enabled: boolean; conditions: unknown[]; logic: 'AND' | 'OR' } }
      >(`${orgPrefix()}/ai/configure-screening-rules`, data),
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

// ─── Agreement AI ──────────────────────────────────────────────

/** Extract agreement template from text */
export function useExtractAgreement() {
  return useMutation({
    mutationFn: (data: { content: string }) =>
      api.post<{
        title: string;
        consentType: string;
        content: string;
        sections: { heading: string; body: string }[];
      }>(`${orgPrefix()}/extract-agreement`, data),
  });
}

/** AI-guided agreement creation chat */
export function useCreateAgreementChat() {
  return useMutation({
    mutationFn: (data: { messages: { role: 'user' | 'assistant'; content: string }[] }) =>
      api.post<
        | { type: 'message'; content: string }
        | { type: 'agreement'; agreement: { title: string; consentType: string; content: string }; summary: string }
      >(`${orgPrefix()}/create-agreement-chat`, data),
  });
}

// ─── Note Template AI ──────────────────────────────────────────

/** Extract note template from text */
export function useExtractNoteTemplate() {
  return useMutation({
    mutationFn: (data: { content: string }) =>
      api.post<{
        title: string;
        format: string;
        fieldDefinitions: { key: string; label: string; placeholder: string; required: boolean; order: number }[];
      }>(`${orgPrefix()}/extract-note-template`, data),
  });
}

/** AI-guided note template creation chat */
export function useCreateNoteTemplateChat() {
  return useMutation({
    mutationFn: (data: { messages: { role: 'user' | 'assistant'; content: string }[] }) =>
      api.post<
        | { type: 'message'; content: string }
        | { type: 'template'; template: { title: string; format: string; fieldDefinitions: { key: string; label: string; placeholder: string; required: boolean; order: number }[] }; summary: string }
      >(`${orgPrefix()}/create-note-template-chat`, data),
  });
}
