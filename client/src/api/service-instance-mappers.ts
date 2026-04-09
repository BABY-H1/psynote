/**
 * Phase 5a — Service instance mappers (pure functions).
 *
 * These functions normalize the four DB-shaped entities (CareEpisode,
 * GroupInstance, CourseInstance, Assessment) into the unified `ServiceInstance`
 * shape defined in `@psynote/shared/types/service-instance`.
 *
 * Why a separate file?
 *   - Mapper logic is pure (no React, no fetching), so it can be unit tested
 *     and reused in `useDeliveryServices` and Phase 6 person-archive views.
 *   - Keeps `useDeliveryServices.ts` focused on react-query orchestration.
 *
 * Status mapping conventions match the per-module Phase 4 migrations:
 *   counseling: active→ongoing, paused→paused, closed→closed, archived→archived
 *   group:      draft→draft, recruiting→recruiting, ongoing→ongoing,
 *               full→ongoing, ended→completed
 *   course:     draft→draft, active→ongoing, closed→closed, archived→archived
 *   assessment: (status, isActive) → (draft|active|paused|archived)
 *               via getLogicalAssessmentStatus(), then mapped.
 */

import type {
  CareEpisode,
  GroupInstance,
  CourseInstance,
  Assessment,
  ServiceInstance,
  ServiceStatus,
  CounselingServiceInstance,
  GroupServiceInstance,
  CourseServiceInstance,
  AssessmentServiceInstance,
} from '@psynote/shared';

// ─── Episode (counseling) ────────────────────────────────────────

/** API response for episodes also includes the populated client */
export type EpisodeWithClient = CareEpisode & {
  client?: { id?: string; name?: string; email?: string };
  sessionCount?: number;
  nextAppointment?: string;
};

function mapEpisodeStatus(s: CareEpisode['status']): ServiceStatus {
  switch (s) {
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
    case 'closed':
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

export function episodeToServiceInstance(e: EpisodeWithClient): CounselingServiceInstance {
  return {
    id: e.id,
    kind: 'counseling',
    orgId: e.orgId,
    title: e.client?.name || '未知来访者',
    status: mapEpisodeStatus(e.status),
    ownerId: e.counselorId || '',
    participantCount: 1, // counseling = 1 client per episode
    nextSessionAt: e.nextAppointment,
    lastActivityAt: e.updatedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    clientId: e.clientId,
    clientName: e.client?.name || '未知来访者',
    currentRisk: e.currentRisk,
  };
}

// ─── Group instance ──────────────────────────────────────────────

function mapGroupStatus(s: GroupInstance['status']): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'recruiting':
      return 'recruiting';
    case 'ongoing':
      return 'ongoing';
    case 'full':
      return 'ongoing';
    case 'ended':
      return 'completed';
    default:
      return 'draft';
  }
}

export function groupInstanceToServiceInstance(g: GroupInstance): GroupServiceInstance {
  return {
    id: g.id,
    kind: 'group',
    orgId: g.orgId,
    title: g.title,
    status: mapGroupStatus(g.status),
    ownerId: g.leaderId || g.createdBy || '',
    participantCount: 0, // not populated by list endpoint; refined in detail view
    lastActivityAt: g.updatedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    schemeId: g.schemeId,
    capacity: g.capacity,
  };
}

// ─── Course instance ─────────────────────────────────────────────

function mapCourseStatus(s: CourseInstance['status']): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'ongoing';
    case 'closed':
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

export function courseInstanceToServiceInstance(c: CourseInstance): CourseServiceInstance {
  return {
    id: c.id,
    kind: 'course',
    orgId: c.orgId,
    title: c.title,
    status: mapCourseStatus(c.status),
    ownerId: c.responsibleId || c.createdBy || '',
    participantCount: c.enrollmentCount ?? 0,
    lastActivityAt: c.updatedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    courseId: c.courseId,
    courseType: c.course?.courseType,
  };
}

// ─── Assessment ──────────────────────────────────────────────────

/**
 * Same logic as `AssessmentManagement.tsx` and `AssessmentDetail.tsx`. Kept
 * inline here so the mapper module is self-contained.
 */
function getLogicalAssessmentStatus(a: Assessment): 'draft' | 'active' | 'paused' | 'archived' {
  if (a.status === 'draft') return 'draft';
  if (a.status === 'archived') return 'archived';
  return a.isActive ? 'active' : 'paused';
}

function mapAssessmentLogicalStatus(
  ls: 'draft' | 'active' | 'paused' | 'archived',
): ServiceStatus {
  switch (ls) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
    case 'archived':
      return 'archived';
  }
}

export function assessmentToServiceInstance(a: Assessment): AssessmentServiceInstance {
  return {
    id: a.id,
    kind: 'assessment',
    orgId: a.orgId,
    title: a.title,
    status: mapAssessmentLogicalStatus(getLogicalAssessmentStatus(a)),
    ownerId: a.createdBy || '',
    participantCount: 0, // not populated on the list endpoint
    lastActivityAt: a.updatedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    assessmentType: a.assessmentType,
  };
}

// ─── Convenience: a single union mapper that picks the right per-kind fn ──

export function toServiceInstance(
  e: EpisodeWithClient | GroupInstance | CourseInstance | Assessment,
  kind: 'counseling' | 'group' | 'course' | 'assessment',
): ServiceInstance {
  switch (kind) {
    case 'counseling':
      return episodeToServiceInstance(e as EpisodeWithClient);
    case 'group':
      return groupInstanceToServiceInstance(e as GroupInstance);
    case 'course':
      return courseInstanceToServiceInstance(e as CourseInstance);
    case 'assessment':
      return assessmentToServiceInstance(e as Assessment);
  }
}
