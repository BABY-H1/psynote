/**
 * Phase 9α — Hooks for C-facing content blocks (courses & group sessions).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import type {
  ContentBlockType,
  BlockVisibility,
  CourseContentBlock,
  GroupSessionBlock,
} from '@psynote/shared';

type ParentType = 'course' | 'group';
type BlockRecord = CourseContentBlock | GroupSessionBlock;

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

// ─── Queries ────────────────────────────────────────────────────────

/**
 * List blocks for a single parent (chapter or scheme session).
 */
export function useContentBlocks(parentType: ParentType, parentId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['content-blocks', orgId, parentType, parentId],
    queryFn: () =>
      api.get<BlockRecord[]>(
        `${orgPrefix()}/content-blocks?parentType=${parentType}&parentId=${parentId}`,
      ),
    enabled: !!orgId && !!parentId,
  });
}

/**
 * Batch list blocks for multiple parents at once — avoids N+1 when
 * CourseDetail loads a whole course with many chapters.
 */
export function useContentBlocksBatch(
  parentType: ParentType,
  parentIds: string[] | undefined,
) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const key = (parentIds ?? []).join(',');
  return useQuery({
    queryKey: ['content-blocks-batch', orgId, parentType, key],
    queryFn: () =>
      api.get<BlockRecord[]>(
        `${orgPrefix()}/content-blocks/batch?parentType=${parentType}&parentIds=${key}`,
      ),
    enabled: !!orgId && !!parentIds && parentIds.length > 0,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────

export function useCreateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      parentType: ParentType;
      parentId: string;
      blockType: ContentBlockType;
      visibility?: BlockVisibility;
      sortOrder?: number;
      payload?: unknown;
    }) => api.post<BlockRecord>(`${orgPrefix()}/content-blocks`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-blocks'] });
      qc.invalidateQueries({ queryKey: ['content-blocks-batch'] });
    },
  });
}

export function useUpdateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockId,
      parentType,
      ...patch
    }: {
      blockId: string;
      parentType: ParentType;
      payload?: unknown;
      visibility?: BlockVisibility;
      sortOrder?: number;
    }) =>
      api.patch<BlockRecord>(
        `${orgPrefix()}/content-blocks/${blockId}?parentType=${parentType}`,
        patch,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-blocks'] });
      qc.invalidateQueries({ queryKey: ['content-blocks-batch'] });
    },
  });
}

export function useDeleteContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, parentType }: { blockId: string; parentType: ParentType }) =>
      api.delete<void>(
        `${orgPrefix()}/content-blocks/${blockId}?parentType=${parentType}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-blocks'] });
      qc.invalidateQueries({ queryKey: ['content-blocks-batch'] });
    },
  });
}

export function useReorderContentBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      parentType: ParentType;
      parentId: string;
      orderedIds: string[];
    }) => api.post<void>(`${orgPrefix()}/content-blocks/reorder`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-blocks'] });
      qc.invalidateQueries({ queryKey: ['content-blocks-batch'] });
    },
  });
}
