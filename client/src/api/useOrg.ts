import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export interface OrgMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  status: string;
  permissions: Record<string, unknown>;
  validUntil?: string;
  supervisorId?: string | null;
  certifications?: Array<{
    name: string;
    issuer: string;
    number: string;
    issuedAt: string;
    expiresAt?: string;
    fileUrl?: string;
  }>;
  specialties?: string[];
  maxCaseload?: number | null;
  bio?: string | null;
  createdAt: string;
}

export function useOrgMembers() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['members', orgId],
    queryFn: () => api.get<OrgMember[]>(`${orgPrefix()}/members`),
    enabled: !!orgId,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: string; name?: string; supervisorId?: string; fullPracticeAccess?: boolean }) =>
      api.post<OrgMember>(`${orgPrefix()}/members/invite`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, ...data }: { memberId: string; role?: string; status?: string; permissions?: Record<string, unknown> }) =>
      api.patch(`${orgPrefix()}/members/${memberId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`${orgPrefix()}/members/${memberId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}
