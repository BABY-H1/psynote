import { eq, and, inArray, type SQL, type Column } from 'drizzle-orm';
import { ForbiddenError } from './errors.js';
import type { DataScope } from '../middleware/data-scope.js';

/**
 * Returns a Drizzle WHERE condition that filters results by the user's data scope.
 * Throws ForbiddenError if scope type is 'none' or (for 'assigned' with empty list)
 * the user has no access to any client.
 *
 * @param scope - The resolved DataScope from dataScopeGuard
 * @param clientIdColumn - The Drizzle column representing client_id
 * @param orgIdColumn - The Drizzle column representing org_id
 * @param orgId - The current org ID value
 */
export function clientScopeCondition(
  scope: DataScope,
  clientIdColumn: Column,
  orgIdColumn: Column,
  orgId: string,
): SQL {
  const orgFilter = eq(orgIdColumn, orgId);

  if (scope.type === 'all') {
    return orgFilter;
  }

  if (scope.type === 'assigned') {
    if (!scope.allowedClientIds || scope.allowedClientIds.length === 0) {
      // No assigned clients → return impossible condition
      return and(orgFilter, eq(clientIdColumn, 'no-access'))!;
    }
    return and(orgFilter, inArray(clientIdColumn, scope.allowedClientIds))!;
  }

  throw new ForbiddenError('You do not have access to this data');
}
