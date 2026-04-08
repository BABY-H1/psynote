import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Scale } from '@psynote/shared';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export type ScaleListItem = Scale & { dimensionCount?: number; itemCount?: number };

export function useScales() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['scales', orgId],
    queryFn: () => api.get<ScaleListItem[]>(`${orgPrefix()}/scales`),
    enabled: !!orgId,
  });
}

export function useScale(scaleId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['scales', orgId, scaleId],
    queryFn: () => api.get<Scale>(`${orgPrefix()}/scales/${scaleId}`),
    enabled: !!orgId && !!scaleId,
  });
}

export function useCreateScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      instructions?: string;
      scoringMode?: string;
      isPublic?: boolean;
      dimensions: {
        name: string;
        description?: string;
        calculationMethod?: string;
        sortOrder?: number;
        rules?: {
          minScore: number;
          maxScore: number;
          label: string;
          description?: string;
          advice?: string;
          riskLevel?: string;
        }[];
      }[];
      items: {
        text: string;
        dimensionIndex: number;
        isReverseScored?: boolean;
        options: { label: string; value: number }[];
        sortOrder?: number;
      }[];
    }) => api.post<Scale>(`${orgPrefix()}/scales`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scales'] });
    },
  });
}

export interface UpdateScaleDimensionInput {
  name: string;
  description?: string;
  calculationMethod?: string;
  sortOrder?: number;
  rules?: {
    minScore: number;
    maxScore: number;
    label: string;
    description?: string;
    advice?: string;
    riskLevel?: string;
  }[];
}

export interface UpdateScaleItemInput {
  text: string;
  dimensionIndex: number;
  isReverseScored?: boolean;
  options: { label: string; value: number }[];
  sortOrder?: number;
}

export function useUpdateScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scaleId, ...data }: { scaleId: string } & Partial<{
      title: string;
      description: string;
      instructions: string;
      scoringMode: string;
      isPublic: boolean;
      dimensions: UpdateScaleDimensionInput[];
      items: UpdateScaleItemInput[];
    }>) => api.patch<Scale>(`${orgPrefix()}/scales/${scaleId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scales'] });
    },
  });
}

export function useDeleteScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scaleId: string) => api.delete(`${orgPrefix()}/scales/${scaleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scales'] });
    },
  });
}
