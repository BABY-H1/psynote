import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';

/**
 * Guard for the 6 knowledge-library resources (scales / goals / agreements /
 * schemes / courses / note_templates): refuse mutations on rows that aren't
 * owned by the caller's current org.
 *
 * The same listing endpoints merge an org's own rows with platform-level
 * rows (`org_id IS NULL`) — a counselor should *see* the platform PHQ-9 in
 * their library, but must not be able to PATCH or DELETE it. Without this
 * guard, the existing PATCH `/orgs/:orgId/scales/:id` silently updates
 * the platform row because the WHERE clause only matches on id.
 *
 * Usage:
 *   await assertLibraryItemOwnedByOrg(scales, scaleId, request.org!.orgId);
 *   // continues if owned; throws NotFound or Forbidden otherwise.
 *
 * Why two error types:
 *   - NotFound if the id doesn't exist at all (normal 404).
 *   - Forbidden if the id exists but is owned by another org or the platform
 *     (different from "never existed" — the caller shouldn't be able to
 *     distinguish the two in responses, but logs should).
 */
export async function assertLibraryItemOwnedByOrg(
  table: PgTable & { id: any; orgId: any },
  id: string,
  orgId: string,
): Promise<void> {
  const [row] = await db
    .select({ orgId: (table as any).orgId })
    .from(table)
    .where(eq((table as any).id, id))
    .limit(1);

  if (!row) {
    throw new NotFoundError('library item', id);
  }
  if (row.orgId !== orgId) {
    throw new ForbiddenError(
      'Cannot modify a library item owned by another organization or the platform',
    );
  }
}
