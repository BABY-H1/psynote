import type { GroupStatus, EnrollmentStatus, GroupSessionStatus, AttendanceStatus, SchemeVisibility } from './enums';

export interface KeyResult {
  title: string;
  metric?: string;
}

export interface SessionPhase {
  name: string;
  duration?: string;
  description?: string;
  facilitatorNotes?: string;
}

export interface GroupScheme {
  id: string;
  orgId?: string;
  title: string;
  description?: string;
  theory?: string;
  // Goals
  overallGoal?: string;
  specificGoals?: KeyResult[];
  // Target audience
  targetAudience?: string;
  ageRange?: string;
  selectionCriteria?: string;
  // Group settings
  recommendedSize?: string;
  totalSessions?: number;
  sessionDuration?: string;
  frequency?: string;
  // Facilitator & evaluation
  facilitatorRequirements?: string;
  evaluationMethod?: string;
  notes?: string;
  // Meta
  visibility: SchemeVisibility;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  sessions?: GroupSchemeSession[];
}

export interface GroupSchemeSession {
  id: string;
  schemeId: string;
  title: string;
  goal?: string;
  phases?: SessionPhase[];
  materials?: string;
  duration?: string;
  homework?: string;
  assessmentNotes?: string;
  relatedGoals?: number[];
  sessionTheory?: string;
  sessionEvaluation?: string;
  sortOrder: number;
  relatedAssessmentId?: string;
}

export interface GroupInstance {
  id: string;
  orgId: string;
  schemeId?: string;
  title: string;
  description?: string;
  category?: string;
  leaderId?: string;
  schedule?: string;
  duration?: string;
  startDate?: string;
  location?: string;
  status: GroupStatus;
  capacity?: number;
  screeningAssessmentId?: string;
  preAssessmentId?: string;
  postAssessmentId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupEnrollment {
  id: string;
  instanceId: string;
  userId: string;
  careEpisodeId?: string;
  status: EnrollmentStatus;
  screeningResultId?: string;
  enrolledAt?: string;
  createdAt: string;
}

export interface GroupSessionRecord {
  id: string;
  instanceId: string;
  schemeSessionId?: string;
  sessionNumber: number;
  title: string;
  date?: string;
  status: GroupSessionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  attendance?: GroupSessionAttendance[];
  attendanceCount?: number;
}

export interface GroupSessionAttendance {
  id: string;
  sessionRecordId: string;
  enrollmentId: string;
  status: AttendanceStatus;
  note?: string;
  createdAt: string;
  user?: { id: string; name?: string; email?: string };
}
