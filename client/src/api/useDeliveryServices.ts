/**
 * `useDeliveryServices`: cross-module aggregation hook.
 *
 * Two implementations behind a single API:
 *
 *   Phase 5a — Client fan-out (default).
 *     Calls the four existing list hooks (`useEpisodes` / `useGroupInstances`
 *     / `useCourseInstances` / `useAssessments`), maps each row to a unified
 *     `ServiceInstance`, and merges/sorts client-side. Pros: zero backend
 *     changes, React Query deduplicates with anyone else who's already calling
 *     the same lists. Cons: 4 round-trips, no server-side pagination.
 *
 *   Phase 5b — Server aggregation.
 *     Calls a single `GET /api/orgs/:orgId/services` route that runs a
 *     PostgreSQL UNION ALL across the 4 tables and returns paginated, sorted
 *     `ServiceInstance` rows directly. Pros: 1 round-trip, correct pagination,
 *     scales to 100k+ services. Cons: a separate code path that must stay in
 *     sync with the per-module list endpoints.
 *
 * Mode selection (in priority order):
 *   1. Explicit `source` option on the call site
 *   2. Vite env var `VITE_DELIVERY_AGGREGATION_SOURCE` ('client' | 'server')
 *   3. Default = 'client' (Phase 5a behaviour, safest)
 *
 * Filtering & sorting:
 *   - `kind?`   — restrict to one or more kinds
 *   - `status?` — restrict to one or more `ServiceStatus` values
 *   - sort:       always `lastActivityAt desc` (= updatedAt desc)
 *
 * Loading semantics: `isLoading` is true until the first fetch completes.
 * `isError` reflects an error in the active source.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEpisodes } from './useCounseling';
import { useGroupInstances } from './useGroups';
import { useCourseInstances } from './useCourseInstances';
import { useAssessments } from './useAssessments';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';
import {
  episodeToServiceInstance,
  groupInstanceToServiceInstance,
  courseInstanceToServiceInstance,
  assessmentToServiceInstance,
  type EpisodeWithClient,
} from './service-instance-mappers';
import type { ServiceInstance, ServiceKind, ServiceStatus, CourseInstance, Assessment, GroupInstance } from '@psynote/shared';

export type DeliveryAggregationSource = 'client' | 'server';

export interface UseDeliveryServicesOptions {
  /** Restrict to one or more kinds. Empty/undefined = all kinds. */
  kind?: ServiceKind | ServiceKind[];
  /** Restrict to one or more statuses. Empty/undefined = all statuses. */
  status?: ServiceStatus | ServiceStatus[];
  /** Optional: cap the result to the top N items after sorting. */
  limit?: number;
  /**
   * Override the data source for this call. Defaults to:
   *   `import.meta.env.VITE_DELIVERY_AGGREGATION_SOURCE` if set, else 'client'.
   */
  source?: DeliveryAggregationSource;
}

export interface UseDeliveryServicesResult {
  data: ServiceInstance[];
  isLoading: boolean;
  isError: boolean;
  /** Per-kind error breakdown — only populated in 'client' mode */
  errors: Partial<Record<ServiceKind, Error>>;
  /** Which source actually served this call */
  source: DeliveryAggregationSource;
}

function resolveSource(explicit?: DeliveryAggregationSource): DeliveryAggregationSource {
  if (explicit) return explicit;
  const envVal = (import.meta.env as any)?.VITE_DELIVERY_AGGREGATION_SOURCE;
  if (envVal === 'server') return 'server';
  return 'client';
}

export function useDeliveryServices(
  options: UseDeliveryServicesOptions = {},
): UseDeliveryServicesResult {
  const source = resolveSource(options.source);

  // Both implementations are mounted unconditionally so the hook order stays
  // stable across renders, but only the active one's data flows through to the
  // returned result. The inactive one short-circuits via `enabled: false`.
  const clientResult = useClientFanout(options, source === 'client');
  const serverResult = useServerAggregation(options, source === 'server');

  return source === 'server' ? serverResult : clientResult;
}

// ─── Implementation A: Client fan-out (Phase 5a) ─────────────────

function useClientFanout(
  options: UseDeliveryServicesOptions,
  active: boolean,
): UseDeliveryServicesResult {
  // The 4 list hooks have their own `enabled` based on org/auth, so we can't
  // simply gate them with `active`. Instead, when inactive we let them run
  // (React Query dedups them anyway) but skip the merge work.
  const episodesQ = useEpisodes();
  const groupsQ = useGroupInstances();
  const coursesQ = useCourseInstances();
  const assessmentsQ = useAssessments();

  const isLoading =
    active && (episodesQ.isLoading || groupsQ.isLoading || coursesQ.isLoading || assessmentsQ.isLoading);
  const isError =
    active && (episodesQ.isError || groupsQ.isError || coursesQ.isError || assessmentsQ.isError);

  const errors: UseDeliveryServicesResult['errors'] = {};
  if (active) {
    if (episodesQ.error) errors.counseling = episodesQ.error as Error;
    if (groupsQ.error) errors.group = groupsQ.error as Error;
    if (coursesQ.error) errors.course = coursesQ.error as Error;
    if (assessmentsQ.error) errors.assessment = assessmentsQ.error as Error;
  }

  const data = useMemo<ServiceInstance[]>(() => {
    if (!active) return [];

    const wantKinds = normalizeFilter(options.kind);
    const wantStatuses = normalizeFilter(options.status);

    const merged: ServiceInstance[] = [];

    if (!wantKinds || wantKinds.has('counseling')) {
      for (const e of (episodesQ.data ?? []) as EpisodeWithClient[]) {
        merged.push(episodeToServiceInstance(e));
      }
    }
    if (!wantKinds || wantKinds.has('group')) {
      for (const g of (groupsQ.data ?? []) as GroupInstance[]) {
        merged.push(groupInstanceToServiceInstance(g));
      }
    }
    if (!wantKinds || wantKinds.has('course')) {
      for (const c of (coursesQ.data ?? []) as CourseInstance[]) {
        merged.push(courseInstanceToServiceInstance(c));
      }
    }
    if (!wantKinds || wantKinds.has('assessment')) {
      for (const a of (assessmentsQ.data ?? []) as Assessment[]) {
        merged.push(assessmentToServiceInstance(a));
      }
    }

    const filtered = wantStatuses ? merged.filter((s) => wantStatuses.has(s.status)) : merged;

    filtered.sort((a, b) => {
      const ta = a.lastActivityAt || a.updatedAt;
      const tb = b.lastActivityAt || b.updatedAt;
      return tb.localeCompare(ta);
    });

    return options.limit ? filtered.slice(0, options.limit) : filtered;
  }, [
    active,
    episodesQ.data,
    groupsQ.data,
    coursesQ.data,
    assessmentsQ.data,
    options.kind,
    options.status,
    options.limit,
  ]);

  return { data, isLoading, isError, errors, source: 'client' };
}

// ─── Implementation B: Server aggregation (Phase 5b) ─────────────

interface ServerAggregationResponse {
  items: ServiceInstance[];
  total: number;
}

function useServerAggregation(
  options: UseDeliveryServicesOptions,
  active: boolean,
): UseDeliveryServicesResult {
  const orgId = useAuthStore((s) => s.currentOrgId);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const kinds = options.kind ? (Array.isArray(options.kind) ? options.kind : [options.kind]) : null;
    if (kinds && kinds.length > 0) params.set('kind', kinds.join(','));
    const statuses = options.status
      ? Array.isArray(options.status) ? options.status : [options.status]
      : null;
    if (statuses && statuses.length > 0) params.set('status', statuses.join(','));
    if (options.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [options.kind, options.status, options.limit]);

  const q = useQuery<ServerAggregationResponse>({
    queryKey: ['delivery-services', orgId, queryString],
    queryFn: () => api.get<ServerAggregationResponse>(`/orgs/${orgId}/services${queryString}`),
    enabled: active && !!orgId,
  });

  return {
    data: q.data?.items ?? [],
    isLoading: active && q.isLoading,
    isError: active && q.isError,
    errors: {},
    source: 'server',
  };
}

function normalizeFilter<T extends string>(v: T | T[] | undefined): Set<T> | null {
  if (!v) return null;
  return new Set(Array.isArray(v) ? v : [v]);
}

// ─── Phase 9β — Unified launch verb ─────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query';

export type LaunchActionType =
  | 'launch_course'
  | 'launch_group'
  | 'create_episode'
  | 'send_assessment'
  | 'send_consent'
  | 'create_referral';

export interface LaunchResult {
  kind: 'course' | 'group' | 'counseling' | 'assessment' | 'consent' | 'referral';
  instanceId: string;
  enrollmentIds?: string[];
  summary: string;
}

/**
 * Phase 9β — Hook around the unified `POST /services/launch` endpoint.
 * One call site for all 6 actionTypes; the AI suggestion panel uses this
 * for one-click adoption.
 */
export function useLaunchService() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { actionType: LaunchActionType; payload: unknown }) =>
      api.post<LaunchResult>(`/orgs/${orgId}/services/launch`, input),
    onSuccess: () => {
      // Invalidate everything that may show the new instance
      qc.invalidateQueries({ queryKey: ['delivery-services'] });
      qc.invalidateQueries({ queryKey: ['episodes'] });
      qc.invalidateQueries({ queryKey: ['group-instances'] });
      qc.invalidateQueries({ queryKey: ['course-instances'] });
      qc.invalidateQueries({ queryKey: ['assessments'] });
      qc.invalidateQueries({ queryKey: ['referrals'] });
    },
  });
}
