/**
 * Phase 14 — Family / parent-binding hooks for the portal.
 *
 * - `useMyChildren()`             — list of active relationships I hold
 * - `useRevokeRelationship()`     — revoke (sever) a relationship I hold
 * - `useInvitationPreview(token)` — public landing-page preview
 * - `useAcceptParentInvitation()` — bind + receive JWT, write to authStore
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MyChildEntry,
  ParentBindTokenPreview,
  ParentBindRequest,
  ParentBindResponse,
} from '@psynote/shared';
import { api } from '@client/api/client';
import { useAuthStore } from '@client/stores/authStore';

// ─── My children (auth required) ────────────────────────────────

export function useMyChildren() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['myChildren', orgId],
    queryFn: () => api.get<MyChildEntry[]>(`/orgs/${orgId}/client/children`),
    enabled: !!orgId,
  });
}

export function useRevokeRelationship() {
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useMutation({
    mutationFn: (relationshipId: string) =>
      api.delete(`/orgs/${orgId}/client/children/${relationshipId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myChildren'] });
    },
  });
}

// ─── Public landing (no auth) ───────────────────────────────────

export function useInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invitationPreview', token],
    queryFn: () => api.get<ParentBindTokenPreview>(`/public/parent-bind/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptParentInvitation() {
  return useMutation({
    mutationFn: ({ token, ...body }: { token: string } & ParentBindRequest) =>
      api.post<ParentBindResponse>(`/public/parent-bind/${token}`, body),
  });
}
