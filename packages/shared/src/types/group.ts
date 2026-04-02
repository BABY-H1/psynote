import type { GroupCategory, GroupStatus, EnrollmentStatus } from './enums';

export interface GroupScheme {
  id: string;
  orgId?: string;
  title: string;
  description?: string;
  theory?: string;
  category?: GroupCategory;
  tags?: string[];
  isPublic: boolean;
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
  activities?: string;
  materials?: string;
  duration?: string;
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
