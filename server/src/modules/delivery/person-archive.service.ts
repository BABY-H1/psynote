import { sql, eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  users,
  careEpisodes,
  groupInstances,
  groupEnrollments,
  courseInstances,
  courseEnrollments,
  assessments,
  assessmentResults,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

/**
 * Phase 6 — Person archive aggregation (server-side).
 *
 * "Person archive" = the complete cross-module service history of a single
 * user (来访者 / 学员 / 受测者). Same person, four kinds of touchpoints:
 *   - care_episodes WHERE client_id = userId
 *   - group_enrollments WHERE user_id = userId → JOIN group_instances
 *   - course_enrollments WHERE user_id = userId → JOIN course_instances
 *   - assessment_results WHERE user_id = userId → JOIN assessments
 *
 * Two endpoints in this module:
 *   listPeople(orgId)          → who has any service touchpoint, sorted by
 *                                 most-recent activity. For PeopleList.tsx.
 *   getPersonArchive(orgId, userId) → full archive of a single user. For
 *                                 PersonArchive.tsx.
 *
 * Status mapping mirrors `delivery.service.ts` (Phase 5b). Keep them in sync.
 */

export interface PersonSummary {
  userId: string;
  name: string;
  email: string | null;
  /** ISO timestamp of the most recent activity across all 4 services */
  lastActivityAt: string;
  /** Per-kind touchpoint counts */
  counts: {
    counseling: number;
    group: number;
    course: number;
    assessment: number;
    total: number;
  };
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
  /**
   * Unified service list (matches the ServiceInstance shape used by
   * DeliveryCard). Includes all services this user has participated in.
   */
  services: ArchivedService[];
  /** Chronological event timeline (oldest → newest) */
  timeline: ArchiveTimelineEvent[];
}

export interface ArchivedService {
  id: string;
  kind: 'counseling' | 'group' | 'course' | 'assessment';
  orgId: string;
  title: string;
  status: string;
  description: string | null;
  /** When this user joined / was first associated with the service */
  joinedAt: string | null;
  /** When the service itself was last updated */
  lastActivityAt: string;
  /** Optional: course/group instance id if relevant for deep linking */
  instanceId: string | null;
  /** counseling-only: chief complaint */
  chiefComplaint: string | null;
  /** counseling-only: current risk */
  currentRisk: string | null;
  /** assessment-only: total score */
  totalScore: number | null;
}

export interface ArchiveTimelineEvent {
  id: string;
  kind: 'counseling' | 'group' | 'course' | 'assessment';
  type: 'episode_opened' | 'episode_closed' | 'group_enrolled' | 'course_enrolled' | 'assessment_taken';
  at: string;
  title: string;
  detail?: string;
  /** Reference to the underlying service */
  serviceId: string;
}

// ─── List people ─────────────────────────────────────────────────

/**
 * Return all users in this org who are either:
 *   - members with role='client' (freshly registered, even before any touchpoint)
 *   - have at least one service touchpoint (counseling / group / course / assessment)
 *
 * Implementation: SQL UNION across 4 touchpoint tables PLUS the org_members table
 * (filtered to role='client'), grouped by user_id with LEFT JOIN to `users` for
 * name/email. The membership branch ensures freshly registered C-side users
 * (no service activity yet) are visible to counselors so they can be assigned
 * to episodes / appointments. Membership rows yield kind='member' which
 * doesn't count toward any per-kind counter (counseling/group/course/assessment
 * remain 0 until a real touchpoint exists), but the user shows up in the list.
 */
export async function listPeople(orgId: string, limit = 200): Promise<PersonSummary[]> {
  const cap = Math.min(Math.max(limit, 1), 1000);

  const result = await db.execute(sql`
    WITH touchpoints AS (
      SELECT
        ce.client_id::text  AS user_id,
        'counseling'::text  AS kind,
        ce.updated_at       AS last_activity_at
      FROM care_episodes ce
      WHERE ce.org_id = ${orgId}

      UNION ALL

      SELECT
        ge.user_id::text    AS user_id,
        'group'::text       AS kind,
        COALESCE(ge.enrolled_at, ge.created_at, gi.updated_at) AS last_activity_at
      FROM group_enrollments ge
      INNER JOIN group_instances gi ON gi.id = ge.instance_id
      WHERE gi.org_id = ${orgId}

      UNION ALL

      SELECT
        cen.user_id::text   AS user_id,
        'course'::text      AS kind,
        COALESCE(cen.enrolled_at, ci.updated_at) AS last_activity_at
      FROM course_enrollments cen
      INNER JOIN course_instances ci ON ci.id = cen.instance_id
      WHERE ci.org_id = ${orgId}

      UNION ALL

      SELECT
        ar.user_id::text    AS user_id,
        'assessment'::text  AS kind,
        ar.created_at       AS last_activity_at
      FROM assessment_results ar
      WHERE ar.org_id = ${orgId}
        AND ar.user_id IS NOT NULL
        AND ar.deleted_at IS NULL

      UNION ALL

      -- Bare membership: client members with no touchpoint yet still appear
      -- so counselors can find freshly-registered users to schedule with.
      SELECT
        om.user_id::text  AS user_id,
        'member'::text    AS kind,
        COALESCE(om.created_at, NOW()) AS last_activity_at
      FROM org_members om
      WHERE om.org_id = ${orgId}
        AND om.role = 'client'
        AND om.status = 'active'
    )
    SELECT
      t.user_id,
      u.name,
      u.email,
      MAX(t.last_activity_at) AS last_activity_at,
      COUNT(*) FILTER (WHERE t.kind = 'counseling') AS counseling,
      COUNT(*) FILTER (WHERE t.kind = 'group')      AS group_count,
      COUNT(*) FILTER (WHERE t.kind = 'course')     AS course_count,
      COUNT(*) FILTER (WHERE t.kind = 'assessment') AS assessment
    FROM touchpoints t
    LEFT JOIN users u ON u.id = t.user_id::uuid
    GROUP BY t.user_id, u.name, u.email
    ORDER BY MAX(t.last_activity_at) DESC NULLS LAST
    LIMIT ${cap}
  `);

  const rawRows: any[] = Array.isArray(result)
    ? (result as any[])
    : ((result as any).rows ?? []);

  return rawRows.map((row): PersonSummary => {
    const counseling = Number(row.counseling ?? 0);
    const group = Number(row.group_count ?? 0);
    const course = Number(row.course_count ?? 0);
    const assessment = Number(row.assessment ?? 0);
    return {
      userId: String(row.user_id),
      name: row.name ? String(row.name) : '未知用户',
      email: row.email ? String(row.email) : null,
      lastActivityAt: new Date(row.last_activity_at).toISOString(),
      counts: {
        counseling,
        group,
        course,
        assessment,
        total: counseling + group + course + assessment,
      },
    };
  });
}

// ─── Get one person's full archive ───────────────────────────────

const STATUS_MAP_EPISODE: Record<string, string> = {
  active: 'ongoing',
  paused: 'paused',
  closed: 'closed',
  archived: 'archived',
};
const STATUS_MAP_GROUP: Record<string, string> = {
  draft: 'draft',
  recruiting: 'recruiting',
  ongoing: 'ongoing',
  full: 'ongoing',
  ended: 'completed',
};
const STATUS_MAP_COURSE: Record<string, string> = {
  draft: 'draft',
  active: 'ongoing',
  closed: 'closed',
  archived: 'archived',
};

function mapAssessmentStatus(status: string, isActive: boolean): string {
  if (status === 'draft') return 'draft';
  if (status === 'archived') return 'archived';
  return isActive ? 'ongoing' : 'paused';
}

/**
 * Fetch the complete archive for a single user. Uses 4 parallel queries
 * (one per kind) plus 1 query for the user record. The whole call is ~5
 * round-trips to PG, all parallelizable, so latency ≈ slowest single query.
 *
 * Throws NotFoundError if the user doesn't exist (regardless of whether they
 * have any touchpoints — non-existent users get a hard 404).
 */
export async function getPersonArchive(orgId: string, userId: string): Promise<PersonArchive> {
  // Run user lookup and 4 service queries in parallel.
  const [userRow, episodesRows, groupRows, courseRows, assessmentRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select()
      .from(careEpisodes)
      .where(and(eq(careEpisodes.orgId, orgId), eq(careEpisodes.clientId, userId)))
      .orderBy(desc(careEpisodes.updatedAt)),
    db
      .select({
        enrollment: groupEnrollments,
        instance: groupInstances,
      })
      .from(groupEnrollments)
      .innerJoin(groupInstances, eq(groupInstances.id, groupEnrollments.instanceId))
      .where(and(eq(groupEnrollments.userId, userId), eq(groupInstances.orgId, orgId)))
      .orderBy(desc(groupInstances.updatedAt)),
    db
      .select({
        enrollment: courseEnrollments,
        instance: courseInstances,
      })
      .from(courseEnrollments)
      .innerJoin(courseInstances, eq(courseInstances.id, courseEnrollments.instanceId))
      .where(and(eq(courseEnrollments.userId, userId), eq(courseInstances.orgId, orgId)))
      .orderBy(desc(courseInstances.updatedAt)),
    db
      .select({
        result: assessmentResults,
        assessment: assessments,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
      .where(
        and(
          eq(assessmentResults.orgId, orgId),
          eq(assessmentResults.userId, userId),
          isNull(assessmentResults.deletedAt),
        ),
      )
      .orderBy(desc(assessmentResults.createdAt)),
  ]);

  if (userRow.length === 0) {
    throw new NotFoundError('User', userId);
  }
  const u = userRow[0];

  // Build the unified service list. Each kind contributes its own row shape
  // mapped onto ArchivedService.
  const services: ArchivedService[] = [];
  const timeline: ArchiveTimelineEvent[] = [];

  for (const e of episodesRows) {
    services.push({
      id: e.id,
      kind: 'counseling',
      orgId: e.orgId,
      title: u.name || '未知来访者',
      status: STATUS_MAP_EPISODE[e.status] ?? 'draft',
      description: e.chiefComplaint,
      joinedAt: e.openedAt ? new Date(e.openedAt).toISOString() : null,
      lastActivityAt: new Date(e.updatedAt).toISOString(),
      instanceId: e.id,
      chiefComplaint: e.chiefComplaint,
      currentRisk: e.currentRisk,
      totalScore: null,
    });
    timeline.push({
      id: `ep-open-${e.id}`,
      kind: 'counseling',
      type: 'episode_opened',
      at: new Date(e.openedAt).toISOString(),
      title: '建立个案',
      detail: e.chiefComplaint || undefined,
      serviceId: e.id,
    });
    if (e.closedAt) {
      timeline.push({
        id: `ep-close-${e.id}`,
        kind: 'counseling',
        type: 'episode_closed',
        at: new Date(e.closedAt).toISOString(),
        title: '个案结案',
        serviceId: e.id,
      });
    }
  }

  for (const row of groupRows) {
    const inst = row.instance;
    const enr = row.enrollment;
    services.push({
      id: inst.id,
      kind: 'group',
      orgId: inst.orgId,
      title: inst.title,
      status: STATUS_MAP_GROUP[inst.status] ?? 'draft',
      description: inst.description,
      joinedAt: enr.enrolledAt
        ? new Date(enr.enrolledAt).toISOString()
        : enr.createdAt
          ? new Date(enr.createdAt).toISOString()
          : null,
      lastActivityAt: new Date(inst.updatedAt).toISOString(),
      instanceId: inst.id,
      chiefComplaint: null,
      currentRisk: null,
      totalScore: null,
    });
    if (enr.enrolledAt || enr.createdAt) {
      timeline.push({
        id: `grp-${enr.id}`,
        kind: 'group',
        type: 'group_enrolled',
        at: new Date((enr.enrolledAt ?? enr.createdAt) as Date | string).toISOString(),
        title: `加入团辅: ${inst.title}`,
        serviceId: inst.id,
      });
    }
  }

  for (const row of courseRows) {
    const inst = row.instance;
    const enr = row.enrollment;
    services.push({
      id: inst.id,
      kind: 'course',
      orgId: inst.orgId,
      title: inst.title,
      status: STATUS_MAP_COURSE[inst.status] ?? 'draft',
      description: inst.description,
      joinedAt: enr.enrolledAt ? new Date(enr.enrolledAt).toISOString() : null,
      lastActivityAt: new Date(inst.updatedAt).toISOString(),
      instanceId: inst.id,
      chiefComplaint: null,
      currentRisk: null,
      totalScore: null,
    });
    if (enr.enrolledAt) {
      timeline.push({
        id: `crs-${enr.id}`,
        kind: 'course',
        type: 'course_enrolled',
        at: new Date(enr.enrolledAt).toISOString(),
        title: `加入课程: ${inst.title}`,
        serviceId: inst.id,
      });
    }
  }

  for (const row of assessmentRows) {
    const a = row.assessment;
    const r = row.result;
    services.push({
      id: a.id,
      kind: 'assessment',
      orgId: a.orgId,
      title: a.title,
      status: mapAssessmentStatus(a.status, a.isActive),
      description: a.description,
      joinedAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      lastActivityAt: new Date(a.updatedAt).toISOString(),
      instanceId: r.id,
      chiefComplaint: null,
      currentRisk: null,
      totalScore: r.totalScore !== null && r.totalScore !== undefined ? Number(r.totalScore) : null,
    });
    timeline.push({
      id: `asm-${r.id}`,
      kind: 'assessment',
      type: 'assessment_taken',
      at: new Date(r.createdAt).toISOString(),
      title: `完成测评: ${a.title}`,
      detail: r.totalScore !== null ? `总分 ${r.totalScore}` : undefined,
      serviceId: a.id,
    });
  }

  // Deduplicate services by (kind, id) — a single user can have multiple
  // assessment results for the same assessment. We keep the most recent
  // joined-at as the "joinedAt" for the dedupe entry.
  const seen = new Map<string, ArchivedService>();
  for (const s of services) {
    const key = `${s.kind}-${s.id}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, s);
    } else {
      // Prefer the more recent joinedAt
      if (s.joinedAt && (!prev.joinedAt || s.joinedAt > prev.joinedAt)) {
        prev.joinedAt = s.joinedAt;
      }
      // If this row has a totalScore and prev doesn't, take it
      if (s.totalScore !== null && prev.totalScore === null) {
        prev.totalScore = s.totalScore;
      }
    }
  }
  const uniqueServices = Array.from(seen.values()).sort((a, b) =>
    b.lastActivityAt.localeCompare(a.lastActivityAt),
  );

  // Sort timeline ascending (oldest → newest)
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const stats = {
    counseling: episodesRows.length,
    group: groupRows.length,
    course: courseRows.length,
    assessment: assessmentRows.length,
    total: episodesRows.length + groupRows.length + courseRows.length + assessmentRows.length,
  };

  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
    },
    stats,
    services: uniqueServices,
    timeline,
  };
}
