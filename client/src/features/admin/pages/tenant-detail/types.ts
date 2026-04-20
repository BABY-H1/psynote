import type { LicenseStatus, OrgTier } from '@psynote/shared';

export interface MemberRow {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface TenantDetailData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  triageConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  members: MemberRow[];
  license: {
    status: LicenseStatus;
    tier: OrgTier | null;
    maxSeats: number | null;
    expiresAt: string | null;
    issuedAt: string | null;
  };
}

export interface ServiceConfig {
  aiConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
    monthlyTokenLimit: number;
  };
  emailConfig: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    senderName: string;
    senderEmail: string;
  };
}

/**
 * Tab values after the 2026-04 consolidation: `overview` + `subscription`
 * + `services` merged into a single `basic` tab with unified edit mode;
 * `members` stays its own tab because it has its own mutation flows.
 */
export type Tab = 'basic' | 'members';

/** Fields edited inline at the top of the basic-info tab. */
export interface BasicInfoDraft {
  name: string;
  orgType: string;
}

export const ROLE_OPTIONS = ['org_admin', 'counselor', 'client'] as const;

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, { label: string; color: string }> = {
  active: { label: '有效', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-red-100 text-red-700' },
  invalid: { label: '无效', color: 'bg-orange-100 text-orange-700' },
  none: { label: '未签发', color: 'bg-slate-100 text-slate-500' },
};

export function extractOrgType(data: TenantDetailData | null): string {
  if (!data) return 'counseling';
  const s = data.settings as { orgType?: string } | null;
  return s?.orgType || 'counseling';
}
