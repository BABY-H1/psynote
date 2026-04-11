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

/** A single follow-up assessment round after group ends */
export interface FollowUpRound {
  assessments: string[];   // assessment IDs
  delayDays: number;       // days after group ends
  label?: string;          // e.g. "第一次随访"
}

/** Full lifecycle assessment configuration for a group instance */
export interface AssessmentConfig {
  screening?: string[];                    // 报名筛查量表
  preGroup?: string[];                     // 入组前测量表
  preGroupStartDate?: string;              // 入组前测开始填写日期 (截止日期 = startDate)
  perSession?: Record<string, string[]>;   // 每节量表, key = sessionNumber as string
  postGroup?: string[];                    // 结组后测量表
  followUp?: FollowUpRound[];             // 多轮随访
  satisfaction?: string[];                 // 满意度调查量表
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
  // Assessment recommendations
  recruitmentAssessments?: string[]; // assessment IDs for recruitment
  overallAssessments?: string[];     // assessment IDs for longitudinal tracking
  screeningNotes?: string;
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
  relatedAssessments?: string[]; // assessment IDs linked to this session
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
  /** @deprecated Use assessmentConfig.screening instead */
  recruitmentAssessments?: string[];
  /** @deprecated Use assessmentConfig.preGroup/postGroup instead */
  overallAssessments?: string[];
  screeningNotes?: string;
  assessmentConfig?: AssessmentConfig;
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
