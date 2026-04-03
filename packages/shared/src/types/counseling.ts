import type {
  EpisodeStatus, RiskLevel, InterventionType,
  TimelineEventType, AppointmentStatus, AppointmentSource,
  SessionType, ReferralTargetType, ReferralStatus,
  FollowUpPlanType, FollowUpDecision, DocType, DocStatus,
  Gender, MaritalStatus, TreatmentPlanStatus, GoalStatus,
  NoteFormat, TemplateVisibility,
} from './enums';

export interface ClientProfile {
  id: string;
  orgId: string;
  userId: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  address?: string;
  occupation?: string;
  education?: string;
  maritalStatus?: MaritalStatus;
  emergencyContact?: { name: string; phone: string; relationship: string };
  medicalHistory?: string;
  familyBackground?: string;
  presentingIssues?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentGoal {
  id: string;
  description: string;
  status: GoalStatus;
  notes?: string;
  createdAt: string;
}

export interface TreatmentIntervention {
  id: string;
  description: string;
  frequency?: string;
  notes?: string;
}

export interface TreatmentPlan {
  id: string;
  orgId: string;
  careEpisodeId: string;
  counselorId: string;
  status: TreatmentPlanStatus;
  title?: string;
  approach?: string;
  goals: TreatmentGoal[];
  interventions: TreatmentIntervention[];
  sessionPlan?: string;
  progressNotes?: string;
  reviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentGoalLibraryItem {
  id: string;
  orgId?: string;
  title: string;
  description?: string;
  problemArea: string;
  category?: string;
  objectivesTemplate: string[];
  interventionSuggestions: string[];
  visibility: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CounselorAvailability {
  id: string;
  orgId: string;
  counselorId: string;
  dayOfWeek: number; // 0=Sunday ... 6=Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  sessionType?: SessionType;
  isActive: boolean;
  createdAt: string;
}

export interface TimeSlot {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

export interface CareEpisode {
  id: string;
  orgId: string;
  clientId: string;
  counselorId?: string;
  status: EpisodeStatus;
  chiefComplaint?: string;
  currentRisk: RiskLevel;
  interventionType?: InterventionType;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CareTimelineEvent {
  id: string;
  careEpisodeId: string;
  eventType: TimelineEventType;
  refId?: string;
  title: string;
  summary?: string;
  metadata: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
}

export interface Appointment {
  id: string;
  orgId: string;
  careEpisodeId?: string;
  clientId: string;
  counselorId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  type?: SessionType;
  source?: AppointmentSource;
  notes?: string;
  createdAt: string;
}

export interface NoteFieldDefinition {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  order?: number;
}

export interface NoteTemplate {
  id: string;
  orgId?: string;
  title: string;
  format: NoteFormat;
  fieldDefinitions: NoteFieldDefinition[];
  isDefault: boolean;
  visibility: TemplateVisibility;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionNote {
  id: string;
  orgId: string;
  careEpisodeId?: string;
  appointmentId?: string;
  clientId: string;
  counselorId: string;
  noteFormat: NoteFormat;
  templateId?: string;
  sessionDate: string;
  duration?: number;
  sessionType?: SessionType;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  fields?: Record<string, string>;
  summary?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteAttachment {
  id: string;
  noteId?: string;
  orgId: string;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize?: number;
  transcription?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface Referral {
  id: string;
  orgId: string;
  careEpisodeId: string;
  clientId: string;
  referredBy: string;
  reason: string;
  riskSummary?: string;
  targetType?: ReferralTargetType;
  targetName?: string;
  targetContact?: string;
  status: ReferralStatus;
  followUpPlan?: string;
  followUpNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpPlan {
  id: string;
  orgId: string;
  careEpisodeId: string;
  counselorId: string;
  planType?: FollowUpPlanType;
  assessmentId?: string;
  frequency?: string;
  nextDue?: string;
  status: 'active' | 'paused' | 'completed';
  notes?: string;
  createdAt: string;
}

export interface FollowUpReview {
  id: string;
  planId: string;
  careEpisodeId: string;
  counselorId: string;
  reviewDate: string;
  resultId?: string;
  riskBefore?: string;
  riskAfter?: string;
  clinicalNote?: string;
  decision?: FollowUpDecision;
  createdAt: string;
}

export interface ClientDocument {
  id: string;
  orgId: string;
  clientId: string;
  careEpisodeId?: string;
  templateId?: string;
  title: string;
  content?: string;
  docType?: DocType;
  consentType?: string;
  status: DocStatus;
  signedAt?: string;
  signatureData?: { name: string; ip?: string; userAgent?: string; timestamp: string };
  filePath?: string;
  createdBy?: string;
  createdAt: string;
}
