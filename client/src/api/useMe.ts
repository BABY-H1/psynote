/**
 * Phase 14f — Self-service hooks for the "我的" settings page.
 *
 * Wraps: GET /users/me, PATCH /users/me, POST /auth/change-password,
 * PATCH /orgs/:orgId/members/me.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import type { OrgRole } from '@psynote/shared';

export interface MeProfile {
  user: {
    id: string;
    email: string | null;
    name: string;
    avatarUrl: string | null;
    isSystemAdmin: boolean;
    isGuardianAccount: boolean;
    createdAt: string;
  };
  member: {
    id: string;
    orgId: string;
    role: OrgRole;
    bio: string | null;
    specialties: string[] | null;
    certifications: unknown[] | null;
    maxCaseload: number | null;
    orgName: string | null;
  } | null;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeProfile>('/users/me'),
  });
}

/** Update own user record (name, avatarUrl). Also refreshes authStore so
 *  the sidebar avatar/name updates immediately. */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; avatarUrl?: string | null }) =>
      api.patch<{ id: string; name: string; email: string | null; avatarUrl: string | null; isSystemAdmin: boolean }>(
        '/users/me',
        body,
      ),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['me'] });
      // Hydrate the persisted auth user so the header reflects the new name/avatar.
      const store = useAuthStore.getState();
      if (store.user && store.accessToken && store.refreshToken) {
        store.setAuth(
          {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            avatarUrl: updated.avatarUrl ?? undefined,
            createdAt: (store.user as any).createdAt ?? '',
          } as any,
          store.accessToken,
          store.refreshToken,
          updated.isSystemAdmin,
        );
      }
    },
  });
}

/** Update counselor-profile subset on my own org_members row (bio,
 *  specialties, certifications). */
export function useUpdateMyMemberProfile() {
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useMutation({
    mutationFn: (body: {
      bio?: string | null;
      specialties?: string[];
      certifications?: unknown[];
    }) => api.patch(`/orgs/${orgId}/members/me`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

/** Change own password. Returns { ok: true } on success. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword?: string; newPassword: string }) =>
      api.post<{ ok: boolean }>('/auth/change-password', body),
  });
}
