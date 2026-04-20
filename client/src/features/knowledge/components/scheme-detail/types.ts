import type { KeyResult, SessionPhase } from '@psynote/shared';

/**
 * Shared types + constants for SchemeDetail's edit tree.
 *
 * Two-level shape: top-level EditData mirrors scheme fields;
 * nested sessions[] each carry their own phases[] (3 levels deep).
 * Kept as plain (non-readonly) so setState patches stay cheap.
 */

export interface EditSession {
  id?: string;
  title: string;
  goal: string;
  phases: SessionPhase[];
  materials: string;
  duration: string;
  homework: string;
  assessmentNotes: string;
  relatedGoals: number[];
  sessionTheory: string;
  sessionEvaluation: string;
  relatedAssessments: string[];
}

export interface EditData {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: KeyResult[];
  targetAudience: string;
  ageRange: string;
  selectionCriteria: string;
  recommendedSize: string;
  totalSessions: number | undefined;
  sessionDuration: string;
  frequency: string;
  facilitatorRequirements: string;
  evaluationMethod: string;
  notes: string;
  recruitmentAssessments: string[];
  overallAssessments: string[];
  screeningNotes: string;
  visibility: string;
  sessions: EditSession[];
}

export const visibilityLabels: Record<string, string> = {
  personal: '仅自己',
  organization: '本机构',
  public: '公开',
};

export function emptySession(): EditSession {
  return {
    title: '',
    goal: '',
    phases: [],
    materials: '',
    duration: '',
    homework: '',
    assessmentNotes: '',
    relatedGoals: [],
    sessionTheory: '',
    sessionEvaluation: '',
    relatedAssessments: [],
  };
}

/** Strip the Chinese "第 X 次：" prefix that the backend sometimes embeds in session titles. */
export function stripSessionPrefix(title: string): string {
  return title.replace(/^第[一二三四五六七八九十\d]+次[：:]\s*/, '');
}
