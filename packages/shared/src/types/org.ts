import type { OrgRole, MemberStatus, OrgPlan } from './enums';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  settings: Record<string, unknown>;
  triageConfig: TriageConfig;
  dataRetentionPolicy?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: UserPermissions;
  status: MemberStatus;
  validUntil?: string;
  createdAt: string;
}

export interface UserPermissions {
  canConsult?: boolean;
  canAnalyze?: boolean;
}

/** Triage configuration stored in organizations.triage_config */
export interface TriageConfig {
  levels: TriageLevel[];
  aggregation: 'highest' | 'weighted_average' | 'custom_formula';
  requireCounselorConfirm: boolean;
  autoActions: Record<string, string[]>;
}

export interface TriageLevel {
  key: string;
  label: string;
  color: string;
  intervention: string;
  description: string;
  notification: {
    counselor: 'none' | 'normal' | 'urgent';
    admin: 'none' | 'info' | 'urgent';
  };
}
