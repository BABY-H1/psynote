import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';

/**
 * Phase 5b — Cross-module ServiceInstance aggregation (server-side).
 *
 * Returns a unified, paginated, sorted list of all "service instances" the org
 * owns: care episodes (counseling), group instances, course instances, and
 * assessments. The query is a single UNION ALL that normalizes each kind into
 * a common row shape, with status mapping done inline via CASE expressions so
 * the response body matches the `ServiceInstance` shape from
 * `@psynote/shared/types/service-instance` 1:1 — no extra TS transformation.
 *
 * Why UNION ALL (vs fan-out 4 queries)?
 *  - One round-trip
 *  - The DB sorts the merged set by `updated_at desc` server-side, so pagination
 *    is correct across kinds (not biased toward whichever kind has more rows)
 *  - Indices on `(org_id, updated_at)` (where present) make this scan-and-merge
 *    cheaper than 4 separate sorted scans + an in-memory merge.
 *
 * MIRRORED LOGIC: the status mapping CASE expressions below are kept in sync
 * with `client/src/api/service-instance-mappers.ts`. If you change one, change
 * both. Contract: any "status" value returned here MUST be a valid
 * `ServiceStatus` enum value.
 */

export interface ListServicesQuery {
  /** Restrict to one or more kinds. Empty/undefined = all kinds. */
  kinds?: ServiceKindInput[];
  /** Restrict to one or more ServiceStatus values. Empty/undefined = all. */
  statuses?: string[];
  /** Pagination */
  limit?: number;
  offset?: number;
}

export type ServiceKindInput = 'counseling' | 'group' | 'course' | 'assessment';

export interface ServiceInstanceRow {
  id: string;
  kind: ServiceKindInput;
  orgId: string;
  title: string;
  status: string;
  ownerId: string;
  participantCount: number;
  nextSessionAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  // kind-specific fields, nullable for irrelevant kinds
  clientId: string | null;
  clientName: string | null;
  currentRisk: string | null;
  schemeId: string | null;
  capacity: number | null;
  courseId: string | null;
  courseType: string | null;
  assessmentType: string | null;
}

/**
 * Build the UNION ALL query and return ServiceInstance-shaped rows.
 *
 * The 4 sub-selects must produce identical column lists (same names, same
 * types). Postgres infers the type of each NULL by the first non-null branch
 * unless we cast it explicitly — we cast NULLs to the appropriate type to be
 * safe across all four sub-selects.
 */
export async function listServiceInstances(
  orgId: string,
  query: ListServicesQuery = {},
) {
  const limit = Math.min(Math.max(query.limit ?? 60, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);

  // Resolve kind filter to a Set for O(1) inclusion checks below.
  const wantKinds = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null;
  const wantAll = !wantKinds;

  // For each branch, we add a `WHERE EXISTS` short-circuit using a SELECT 1
  // that's only true when the kind is wanted. This lets the DB skip whole
  // branches without scanning the table.
  //
  // We also pre-filter by service status using a subquery wrapper at the end
  // (since the CASE-mapped status is the value we filter on, not the raw db
  // column). Status filter is applied to the merged result.

  const branches: ReturnType<typeof sql>[] = [];

  if (wantAll || wantKinds!.has('counseling')) {
    branches.push(sql`
      SELECT
        ce.id::text                                    AS id,
        'counseling'::text                             AS kind,
        ce.org_id::text                                AS org_id,
        COALESCE(u.name, '未知来访者')                 AS title,
        CASE ce.status
          WHEN 'active'   THEN 'ongoing'
          WHEN 'paused'   THEN 'paused'
          WHEN 'closed'   THEN 'closed'
          WHEN 'archived' THEN 'archived'
          ELSE 'draft'
        END                                            AS status,
        COALESCE(ce.counselor_id::text, '')            AS owner_id,
        1::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        ce.updated_at                                  AS last_activity_at,
        ce.created_at                                  AS created_at,
        ce.updated_at                                  AS updated_at,
        ce.client_id::text                             AS client_id,
        u.name                                         AS client_name,
        ce.current_risk                                AS current_risk,
        NULL::text                                     AS scheme_id,
        NULL::integer                                  AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
      FROM care_episodes ce
      LEFT JOIN users u ON u.id = ce.client_id
      WHERE ce.org_id = ${orgId}
    `);
  }

  if (wantAll || wantKinds!.has('group')) {
    branches.push(sql`
      SELECT
        gi.id::text                                    AS id,
        'group'::text                                  AS kind,
        gi.org_id::text                                AS org_id,
        gi.title                                       AS title,
        CASE gi.status
          WHEN 'draft'      THEN 'draft'
          WHEN 'recruiting' THEN 'recruiting'
          WHEN 'ongoing'    THEN 'ongoing'
          WHEN 'full'       THEN 'ongoing'
          WHEN 'ended'      THEN 'completed'
          ELSE 'draft'
        END                                            AS status,
        COALESCE(gi.leader_id::text, gi.created_by::text, '') AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        gi.updated_at                                  AS last_activity_at,
        gi.created_at                                  AS created_at,
        gi.updated_at                                  AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        gi.scheme_id::text                             AS scheme_id,
        gi.capacity                                    AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
      FROM group_instances gi
      WHERE gi.org_id = ${orgId}
    `);
  }

  if (wantAll || wantKinds!.has('course')) {
    branches.push(sql`
      SELECT
        ci.id::text                                    AS id,
        'course'::text                                 AS kind,
        ci.org_id::text                                AS org_id,
        ci.title                                       AS title,
        CASE ci.status
          WHEN 'draft'    THEN 'draft'
          WHEN 'active'   THEN 'ongoing'
          WHEN 'closed'   THEN 'closed'
          WHEN 'archived' THEN 'archived'
          ELSE 'draft'
        END                                            AS status,
        COALESCE(ci.responsible_id::text, ci.created_by::text, '') AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        ci.updated_at                                  AS last_activity_at,
        ci.created_at                                  AS created_at,
        ci.updated_at                                  AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        NULL::text                                     AS scheme_id,
        ci.capacity                                    AS capacity,
        ci.course_id::text                             AS course_id,
        NULL::text                                     AS course_type,
        NULL::text                                     AS assessment_type
      FROM course_instances ci
      WHERE ci.org_id = ${orgId}
    `);
  }

  if (wantAll || wantKinds!.has('assessment')) {
    branches.push(sql`
      SELECT
        a.id::text                                     AS id,
        'assessment'::text                             AS kind,
        a.org_id::text                                 AS org_id,
        a.title                                        AS title,
        CASE
          WHEN a.status = 'draft'    THEN 'draft'
          WHEN a.status = 'archived' THEN 'archived'
          WHEN a.is_active           THEN 'ongoing'
          ELSE 'paused'
        END                                            AS status,
        COALESCE(a.created_by::text, '')               AS owner_id,
        0::integer                                     AS participant_count,
        NULL::timestamptz                              AS next_session_at,
        a.updated_at                                   AS last_activity_at,
        a.created_at                                   AS created_at,
        a.updated_at                                   AS updated_at,
        NULL::text                                     AS client_id,
        NULL::text                                     AS client_name,
        NULL::text                                     AS current_risk,
        NULL::text                                     AS scheme_id,
        NULL::integer                                  AS capacity,
        NULL::text                                     AS course_id,
        NULL::text                                     AS course_type,
        a.assessment_type                              AS assessment_type
      FROM assessments a
      WHERE a.org_id = ${orgId}
        AND a.deleted_at IS NULL
    `);
  }

  if (branches.length === 0) {
    return { items: [] as ServiceInstanceRow[], total: 0 };
  }

  // Stitch the branches with UNION ALL.
  const unionParts: ReturnType<typeof sql>[] = [];
  branches.forEach((b, i) => {
    if (i > 0) unionParts.push(sql` UNION ALL `);
    unionParts.push(b);
  });

  // Optional status filter applied to the merged set (since status is the
  // mapped ServiceStatus value, not the raw column).
  // We build an `IN ($1, $2, ...)` clause from the JS array; this is safer
  // than a Postgres text[] literal across drivers.
  const statusFilter = query.statuses && query.statuses.length > 0
    ? sql` WHERE combined.status IN (${sql.join(
        query.statuses.map((s) => sql`${s}`),
        sql`, `,
      )})`
    : sql``;

  // Wrap branches in a subquery to apply status filter, ORDER BY and LIMIT/OFFSET.
  // Postgres requires parens around each UNION arm OR a subquery. Drizzle's
  // sql template emits the joined sql; we wrap with an outer SELECT.
  const finalQuery = sql`
    WITH combined AS (
      ${sql.join(unionParts)}
    )
    SELECT * FROM combined
    ${statusFilter}
    ORDER BY combined.last_activity_at DESC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `;

  const result = await db.execute(finalQuery);

  // db.execute returns { rows: ... } in some drivers and an array directly in
  // others. Normalize.
  const rawRows: any[] = Array.isArray(result)
    ? (result as any[])
    : ((result as any).rows ?? []);

  // Compute total count separately (no LIMIT/OFFSET) for pagination UX.
  // For large orgs we may want to cap or skip this; for now it's OK.
  const countQuery = sql`
    WITH combined AS (
      ${sql.join(unionParts)}
    )
    SELECT COUNT(*)::int AS total FROM combined
    ${statusFilter}
  `;
  const countResult = await db.execute(countQuery);
  const countRows: any[] = Array.isArray(countResult)
    ? (countResult as any[])
    : ((countResult as any).rows ?? []);
  const total = (countRows[0]?.total as number) ?? 0;

  const items: ServiceInstanceRow[] = rawRows.map(toCamel);

  return { items, total };
}

/**
 * Convert snake_case row keys (from raw SQL) to camelCase to match the
 * ServiceInstance TypeScript shape. Drizzle's `db.execute` returns row keys
 * exactly as named in the SELECT, so column aliases like `org_id` arrive as
 * `org_id`. We map only the fields we know about.
 */
function toCamel(row: any): ServiceInstanceRow {
  return {
    id: String(row.id),
    kind: row.kind as ServiceKindInput,
    orgId: String(row.org_id),
    title: String(row.title),
    status: String(row.status),
    ownerId: String(row.owner_id ?? ''),
    participantCount: Number(row.participant_count ?? 0),
    nextSessionAt: row.next_session_at
      ? new Date(row.next_session_at).toISOString()
      : null,
    lastActivityAt: new Date(row.last_activity_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    currentRisk: row.current_risk ? String(row.current_risk) : null,
    schemeId: row.scheme_id ? String(row.scheme_id) : null,
    capacity: row.capacity !== null && row.capacity !== undefined ? Number(row.capacity) : null,
    courseId: row.course_id ? String(row.course_id) : null,
    courseType: row.course_type ? String(row.course_type) : null,
    assessmentType: row.assessment_type ? String(row.assessment_type) : null,
  };
}
