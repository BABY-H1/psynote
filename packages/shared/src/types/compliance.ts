import type { AuditAction, PhiAccessAction, ConsentType, ConsentStatus } from './enums';

export interface AuditLog {
  id: string;
  orgId?: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
  createdAt: string;
}

export interface PhiAccessLog {
  id: string;
  orgId: string;
  userId: string;
  clientId: string;
  resource: string;
  resourceId?: string;
  action: PhiAccessAction;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ConsentTemplate {
  id: string;
  orgId: string;
  title: string;
  consentType: ConsentType;
  content: string;
  isDefault: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRecord {
  id: string;
  orgId: string;
  clientId: string;
  consentType: ConsentType;
  scope: Record<string, unknown>;
  grantedAt?: string;
  revokedAt?: string;
  expiresAt?: string;
  documentId?: string;
  status: ConsentStatus;
  createdAt: string;
}
