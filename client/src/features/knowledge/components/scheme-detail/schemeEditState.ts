import type { KeyResult } from '@psynote/shared';
import type { EditData, EditSession } from './types';

/**
 * Forward transform: backend scheme row → editable EditData. Normalizes
 * goals (which upstream may store as string[] or KeyResult[]) and fills
 * in every session field so the nested updaters can patch freely without
 * ||-guarding every access.
 */
export function schemeToEditData(scheme: any): EditData {
  return {
    title: scheme.title || '',
    description: scheme.description || '',
    theory: scheme.theory || '',
    overallGoal: scheme.overallGoal || '',
    specificGoals: normalizeGoals(scheme.specificGoals),
    targetAudience: scheme.targetAudience || '',
    ageRange: scheme.ageRange || '',
    selectionCriteria: scheme.selectionCriteria || '',
    recommendedSize: scheme.recommendedSize || '',
    totalSessions: scheme.totalSessions || undefined,
    sessionDuration: scheme.sessionDuration || '',
    frequency: scheme.frequency || '',
    facilitatorRequirements: scheme.facilitatorRequirements || '',
    evaluationMethod: scheme.evaluationMethod || '',
    notes: scheme.notes || '',
    recruitmentAssessments: scheme.recruitmentAssessments || [],
    overallAssessments: scheme.overallAssessments || [],
    screeningNotes: scheme.screeningNotes || '',
    visibility: scheme.visibility || 'personal',
    sessions: (scheme.sessions || []).map((s: any) => ({
      id: s.id,
      title: s.title || '',
      goal: s.goal || '',
      phases: s.phases || [],
      materials: s.materials || '',
      duration: s.duration || '',
      homework: s.homework || '',
      assessmentNotes: s.assessmentNotes || '',
      relatedGoals: s.relatedGoals || [],
      sessionTheory: s.sessionTheory || '',
      sessionEvaluation: s.sessionEvaluation || '',
      relatedAssessments: s.relatedAssessments || [],
    })),
  };
}

function normalizeGoals(goals: any[]): KeyResult[] {
  if (!goals || goals.length === 0) return [];
  return goals.map((g: any) => (typeof g === 'string' ? { title: g } : g));
}

/**
 * Inverse of schemeToEditData for the save path: flatten editData +
 * attach sortOrder to each session. Split from handleSave so the
 * orchestrator's save path stays readable.
 */
export function editDataToSavePayload(
  editData: EditData,
  schemeId: string,
): Record<string, unknown> {
  const { sessions, ...rest } = editData;
  return {
    schemeId,
    ...rest,
    sessions: sessions.map((s: EditSession, i: number) => ({ ...s, sortOrder: i })),
  };
}

/**
 * AI-apply merge: only overwrite fields the AI explicitly returned.
 * Preserves the user's current visibility and falls through to
 * previous value when the AI omits a field.
 */
export function mergeAiSchemeChange(prev: EditData, incoming: EditData): EditData {
  return {
    ...prev,
    title: incoming.title || prev.title,
    description: incoming.description || prev.description,
    theory: incoming.theory || prev.theory,
    overallGoal: incoming.overallGoal || prev.overallGoal,
    specificGoals: incoming.specificGoals.length > 0 ? incoming.specificGoals : prev.specificGoals,
    targetAudience: incoming.targetAudience || prev.targetAudience,
    ageRange: incoming.ageRange || prev.ageRange,
    selectionCriteria: incoming.selectionCriteria || prev.selectionCriteria,
    recommendedSize: incoming.recommendedSize || prev.recommendedSize,
    totalSessions: incoming.totalSessions ?? prev.totalSessions,
    sessionDuration: incoming.sessionDuration || prev.sessionDuration,
    frequency: incoming.frequency || prev.frequency,
    facilitatorRequirements: incoming.facilitatorRequirements || prev.facilitatorRequirements,
    evaluationMethod: incoming.evaluationMethod || prev.evaluationMethod,
    notes: incoming.notes || prev.notes,
    sessions: incoming.sessions.length > 0 ? incoming.sessions : prev.sessions,
  };
}
