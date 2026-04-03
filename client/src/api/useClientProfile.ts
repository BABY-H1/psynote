import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientProfile } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function useClientProfile(userId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['clientProfile', orgId, userId],
    queryFn: () => api.get<ClientProfile | null>(`${orgPrefix()}/clients/${userId}/profile`),
    enabled: !!orgId && !!userId,
  });
}

export function useUpsertClientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string } & Partial<Omit<ClientProfile, 'id' | 'orgId' | 'userId' | 'createdAt' | 'updatedAt'>>) =>
      api.put<ClientProfile>(`${orgPrefix()}/clients/${userId}/profile`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['clientProfile'] });
      qc.invalidateQueries({ queryKey: ['clientSummary'] });
    },
  });
}

export function useClientSummary(userId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['clientSummary', orgId, userId],
    queryFn: () => api.get<{
      user: { name: string; email: string; avatarUrl?: string } | null;
      profile: ClientProfile | null;
      activeEpisodes: unknown[];
      recentResults: unknown[];
    }>(`${orgPrefix()}/clients/${userId}/summary`),
    enabled: !!orgId && !!userId,
  });
}
