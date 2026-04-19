import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { crisisCases } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CrisisCase, CrisisCaseStage } from '@psynote/shared';
import { toCrisisCase } from './crisis-helpers.js';

/**
 * Read-only queries on the crisis_cases table. Split out from the workflow
 * service so analytics / read-heavy callers don't pull in the full state
 * machine when they only need to look up a case.
 */

/** Fetch a single case by id within an org. Throws 404 when missing. */
export async function getCaseById(orgId: string, caseId: string): Promise<CrisisCase> {
  const [row] = await db
    .select()
    .from(crisisCases)
    .where(and(eq(crisisCases.id, caseId), eq(crisisCases.orgId, orgId)))
    .limit(1);
  if (!row) throw new NotFoundError('CrisisCase', caseId);
  return toCrisisCase(row);
}

/** Fetch the (unique) crisis case associated with a given care episode. */
export async function getCaseByEpisode(
  orgId: string,
  episodeId: string,
): Promise<CrisisCase | null> {
  const [row] = await db
    .select()
    .from(crisisCases)
    .where(and(eq(crisisCases.episodeId, episodeId), eq(crisisCases.orgId, orgId)))
    .limit(1);
  return row ? toCrisisCase(row) : null;
}

/** List all cases visible within an org, optionally filtered by stage. */
export async function listCases(
  orgId: string,
  filters?: { stage?: CrisisCaseStage },
) {
  const conditions = [eq(crisisCases.orgId, orgId)];
  if (filters?.stage) conditions.push(eq(crisisCases.stage, filters.stage));

  const rows = await db
    .select()
    .from(crisisCases)
    .where(and(...conditions))
    .orderBy(desc(crisisCases.updatedAt));
  return rows.map(toCrisisCase);
}
