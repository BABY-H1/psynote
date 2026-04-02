import type {
  EpisodeStatus, RiskLevel, InterventionType,
  TimelineEventType, AppointmentStatus, AppointmentSource,
  SessionType, ReferralTargetType, ReferralStatus,
  FollowUpPlanType, FollowUpDecision, DocType, DocStatus,
} from './enums';

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

export interface SessionNote {
  id: string;
  orgId: string;
  careEpisodeId?: string;
  appointmentId?: string;
  clientId: string;
  counselorId: string;
  sessionDate: string;
  duration?: number;
  sessionType?: SessionType;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  summary?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
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
  title: string;
  docType?: DocType;
  status: DocStatus;
  signedAt?: string;
  filePath?: string;
  createdAt: string;
}
