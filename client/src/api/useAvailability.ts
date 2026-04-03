import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CounselorAvailability, TimeSlot } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function useMyAvailability(counselorId?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qs = counselorId ? `?counselorId=${counselorId}` : '';
  return useQuery({
    queryKey: ['availability', orgId, counselorId],
    queryFn: () => api.get<CounselorAvailability[]>(`${orgPrefix()}/availability${qs}`),
    enabled: !!orgId,
  });
}

export function useAvailableSlots(counselorId: string | undefined, date: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['availableSlots', orgId, counselorId, date],
    queryFn: () => api.get<(TimeSlot & { sessionType?: string | null })[]>(
      `${orgPrefix()}/availability/slots?counselorId=${counselorId}&date=${date}`,
    ),
    enabled: !!orgId && !!counselorId && !!date,
  });
}

export function useCreateAvailabilitySlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      counselorId?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      sessionType?: string;
    }) => api.post<CounselorAvailability>(`${orgPrefix()}/availability`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['availability'] }); },
  });
}

export function useUpdateAvailabilitySlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, ...data }: {
      slotId: string;
      startTime?: string;
      endTime?: string;
      sessionType?: string | null;
      isActive?: boolean;
    }) => api.patch<CounselorAvailability>(`${orgPrefix()}/availability/${slotId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['availability'] }); },
  });
}

export function useDeleteAvailabilitySlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => api.delete(`${orgPrefix()}/availability/${slotId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['availability'] }); },
  });
}
