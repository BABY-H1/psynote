/**
 * Phase 14 — Counselor-side hooks for class parent invite tokens.
 *
 * - useClassInviteTokens(classId)   — list active + revoked tokens
 * - useCreateClassInviteToken()     — generate a new token (default 30 days)
 * - useRevokeClassInviteToken()     — revoke a token by id
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface ClassParentInviteTokenRow {
  id: string;
  orgId: string;
  classId: string;
  token: string;
  createdBy: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export function useClassInviteTokens(classId: string | null | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['classInviteTokens', orgId, classId],
    queryFn: () =>
      api.get<ClassParentInviteTokenRow[]>(
        `/orgs/${orgId}/school/classes/${classId}/parent-invite-tokens`,
      ),
    enabled: !!orgId && !!classId,
  });
}

export function useCreateClassInviteToken(classId: string | null | undefined) {
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useMutation({
    mutationFn: (body: { expiresInDays?: number }) =>
      api.post<ClassParentInviteTokenRow>(
        `/orgs/${orgId}/school/classes/${classId}/parent-invite-tokens`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classInviteTokens'] });
    },
  });
}

export function useRevokeClassInviteToken(classId: string | null | undefined) {
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useMutation({
    mutationFn: (tokenId: string) =>
      api.delete(
        `/orgs/${orgId}/school/classes/${classId}/parent-invite-tokens/${tokenId}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classInviteTokens'] });
    },
  });
}
