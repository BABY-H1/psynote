/**
 * Phase 6 — Person archive React Query hooks.
 *
 * Two endpoints:
 *   usePeople()                 → GET /api/orgs/:orgId/people
 *   usePersonArchive(userId)    → GET /api/orgs/:orgId/people/:userId/archive
 *
 * The TypeScript types here mirror the server's `person-archive.service.ts`.
 * Keeping them inline (rather than importing from `@psynote/shared`) avoids
 * coupling the cross-module aggregation shape to the canonical type package
 * before its design is fully settled. If/when these stabilize they can be
 * promoted into shared.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export type ArchiveServiceKind = 'counseling' | 'group' | 'course' | 'assessment';

export interface PersonSummary {
  userId: string;
  name: string;
  email: string | null;
  lastActivityAt: string;
  counts: {
    counseling: number;
    group: number;
    course: number;
    assessment: number;
    total: number;
  };
}

export interface ArchivedService {
  id: string;
  kind: ArchiveServiceKind;
  orgId: string;
  title: string;
  status: string;
  description: string | null;
  joinedAt: string | null;
  lastActivityAt: string;
  instanceId: string | null;
  chiefComplaint: string | null;
  currentRisk: string | null;
  totalScore: number | null;
}

export interface ArchiveTimelineEvent {
  id: string;
  kind: ArchiveServiceKind;
  type:
    | 'episode_opened'
    | 'episode_closed'
    | 'group_enrolled'
    | 'course_enrolled'
    | 'assessment_taken';
  at: string;
  title: string;
  detail?: string;
  serviceId: string;
}

export interface PersonArchive {
  user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
  stats: {
    counseling: number;
    group: number;
    course: number;
    assessment: number;
    total: number;
  };
  services: ArchivedService[];
  timeline: ArchiveTimelineEvent[];
}

function orgPrefix(orgId: string | null) {
  return `/orgs/${orgId}`;
}

/**
 * Fetch the list of all users in the org with at least one service touchpoint.
 * Used by `PeopleList.tsx` and `PersonArchivePreview.tsx`.
 */
export function usePeople() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery<{ items: PersonSummary[] }>({
    queryKey: ['people', orgId],
    queryFn: () => api.get<{ items: PersonSummary[] }>(`${orgPrefix(orgId)}/people`),
    enabled: !!orgId,
  });
}

/**
 * Fetch one user's complete cross-module archive. Used by `PersonArchive.tsx`.
 */
export function usePersonArchive(userId: string | undefined) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery<PersonArchive>({
    queryKey: ['person-archive', orgId, userId],
    queryFn: () => api.get<PersonArchive>(`${orgPrefix(orgId)}/people/${userId}/archive`),
    enabled: !!orgId && !!userId,
  });
}
