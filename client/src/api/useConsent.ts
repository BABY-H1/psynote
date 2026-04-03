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
    mutationFn: (data: { title: string; consentType: string; content: string; isDefault?: boolean }) =>
      api.post<ConsentTemplate>(`${orgPrefix()}/compliance/consent-templates`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consentTemplates'] }); },
  });
}

export function useUpdateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, ...data }: { templateId: string; title?: string; consentType?: string; content?: string; isDefault?: boolean }) =>
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
    mutationFn: (data: { clientId: string; careEpisodeId?: string; templateId: string }) =>
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

export function useMyDocuments() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myDocuments', orgId],
    queryFn: () => api.get<ClientDocument[]>(`${orgPrefix()}/client/documents`),
    enabled: !!orgId,
  });
}

export function useSignDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, name }: { docId: string; name: string }) =>
      api.post<ClientDocument>(`${orgPrefix()}/client/documents/${docId}/sign`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myDocuments'] });
      qc.invalidateQueries({ queryKey: ['consentDocuments'] });
      qc.invalidateQueries({ queryKey: ['myConsents'] });
    },
  });
}

export function useMyConsents() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myConsents', orgId],
    queryFn: () => api.get<ConsentRecord[]>(`${orgPrefix()}/client/consents`),
    enabled: !!orgId,
  });
}

export function useRevokeConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (consentId: string) =>
      api.post<ConsentRecord>(`${orgPrefix()}/client/consents/${consentId}/revoke`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myConsents'] }); },
  });
}
