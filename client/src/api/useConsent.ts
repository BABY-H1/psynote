import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConsentTemplate, ConsentRecord } from '@psynote/shared';
import type { ClientDocument } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Templates (counselor side) ─────────────────────────────────

export function useConsentTemplates() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['consentTemplates', orgId],
    queryFn: () => api.get<ConsentTemplate[]>(`${orgPrefix()}/compliance/consent-templates`),
    enabled: !!orgId,
  });
}

export function useCreateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; consentType: string; content: string }) =>
      api.post<ConsentTemplate>(`${orgPrefix()}/compliance/consent-templates`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consentTemplates'] }); },
  });
}

export function useUpdateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, ...data }: { templateId: string; title?: string; consentType?: string; content?: string }) =>
      api.patch<ConsentTemplate>(`${orgPrefix()}/compliance/consent-templates/${templateId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consentTemplates'] }); },
  });
}

export function useDeleteConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api.delete(`${orgPrefix()}/compliance/consent-templates/${templateId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consentTemplates'] }); },
  });
}

// ─── Documents (counselor side) ─────────────────────────────────

export function useSendConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      clientId: string;
      careEpisodeId?: string;
      templateId: string;
      /** Phase 13: 发给 'client'(默认)还是 'guardian'(家长/监护人) */
      recipientType?: 'client' | 'guardian';
      /** 当 recipientType='guardian' 时填写,例如 "母亲 王某" */
      recipientName?: string;
    }) =>
      api.post<ClientDocument>(`${orgPrefix()}/compliance/consent-documents`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consentDocuments'] });
      qc.invalidateQueries({ queryKey: ['myDocuments'] });
    },
  });
}

export function useConsentDocuments(filters?: { clientId?: string; status?: string; careEpisodeId?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['consentDocuments', orgId, filters],
    queryFn: () => api.get<ClientDocument[]>(`${orgPrefix()}/compliance/consent-documents${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

// ─── Client side ────────────────────────────────────────────────

/**
 * Phase 14 — Optional `as` parameter for guardian impersonation.
 * When set, appends `?as=<uid>` to the request so the server returns the
 * child's documents/consents (after verifying the relationship).
 */
function asSuffix(as?: string): string {
  return as ? `?as=${encodeURIComponent(as)}` : '';
}

export function useMyDocuments(opts?: { as?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myDocuments', orgId, opts?.as ?? null],
    queryFn: () => api.get<ClientDocument[]>(`${orgPrefix()}/client/documents${asSuffix(opts?.as)}`),
    enabled: !!orgId,
  });
}

export function useSignDocument(opts?: { as?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, name }: { docId: string; name: string }) =>
      api.post<ClientDocument>(`${orgPrefix()}/client/documents/${docId}/sign${asSuffix(opts?.as)}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myDocuments'] });
      qc.invalidateQueries({ queryKey: ['consentDocuments'] });
      qc.invalidateQueries({ queryKey: ['myConsents'] });
    },
  });
}

export function useMyConsents(opts?: { as?: string }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myConsents', orgId, opts?.as ?? null],
    queryFn: () => api.get<ConsentRecord[]>(`${orgPrefix()}/client/consents${asSuffix(opts?.as)}`),
    enabled: !!orgId,
  });
}

export function useRevokeConsent(opts?: { as?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (consentId: string) =>
      api.post<ConsentRecord>(`${orgPrefix()}/client/consents/${consentId}/revoke${asSuffix(opts?.as)}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myConsents'] }); },
  });
}
