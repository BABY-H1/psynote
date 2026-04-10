/**
 * Phase 9ε — Hooks for the org-internal collaboration page.
 *
 * Wraps the new /collaboration/* endpoints. Each tab on the collaboration
 * page has its own hook so React Query can cache + invalidate independently.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/collaboration`;
}

// ─── Tab A: Assignments ─────────────────────────────────────────────

export interface UnassignedClient {
  id: string;
  name: string;
  email: string | null;
  joined_at: string;
}

export function useUnassignedClients() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['collab-unassigned', orgId],
    queryFn: () => api.get<UnassignedClient[]>(`${orgPrefix()}/unassigned-clients`),
    enabled: !!orgId,
  });
}

export interface AssignmentRow {
  id: string;
  client_id: string;
  counselor_id: string;
  is_primary: boolean;
  assigned_at: string;
  client_name: string;
  counselor_name: string;
}

export function useAssignmentsList() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['collab-assignments', orgId],
    queryFn: () => api.get<AssignmentRow[]>(`${orgPrefix()}/assignments`),
    enabled: !!orgId,
  });
}

// ─── Tab C: Pending notes for supervision ───────────────────────────

export interface PendingNote {
  id: string;
  client_id: string;
  counselor_id: string;
  session_date: string;
  note_format: string;
  status: string;
  submitted_for_review_at: string | null;
  summary: string | null;
  client_name: string;
  counselor_name: string;
}

export function usePendingNotes() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['collab-pending-notes', orgId],
    queryFn: () => api.get<PendingNote[]>(`${orgPrefix()}/pending-notes`),
    enabled: !!orgId,
  });
}

export function useReviewPendingNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId, decision, annotation,
    }: { noteId: string; decision: 'approve' | 'reject'; annotation?: string }) =>
      api.post(`${orgPrefix()}/pending-notes/${noteId}/review`, { decision, annotation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collab-pending-notes'] });
    },
  });
}

// ─── Audit query ────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export function useAuditQuery(filters: {
  userId?: string;
  resource?: string;
  action?: string;
  since?: string;
  until?: string;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['collab-audit', orgId, filters],
    queryFn: () => api.get<AuditRow[]>(`${orgPrefix()}/audit${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}

export interface PhiAccessRow {
  id: string;
  orgId: string;
  userId: string;
  clientId: string;
  resource: string;
  action: string;
  reason: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function usePhiAccessQuery(filters: {
  userId?: string;
  clientId?: string;
  since?: string;
  until?: string;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['collab-phi-access', orgId, filters],
    queryFn: () => api.get<PhiAccessRow[]>(`${orgPrefix()}/phi-access${qs ? `?${qs}` : ''}`),
    enabled: !!orgId,
  });
}
