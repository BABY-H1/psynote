import { eq, and, inArray, type SQL, type Column } from 'drizzle-orm';
import { ForbiddenError } from './errors.js';
import type { DataScope } from '../middleware/data-scope.js';

/**
 * Returns a Drizzle WHERE condition that filters results by the user's data scope.
 * Throws ForbiddenError if scope type is 'basic_only' or 'none' and clinical access is required.
 *
 * @param scope - The resolved DataScope from dataScopeGuard
 * @param clientIdColumn - The Drizzle column representing client_id
 * @param orgIdColumn - The Drizzle column representing org_id
 * @param orgId - The current org ID value
 * @param allowBasicOnly - If true, allows basic_only scope (for admin_staff accessing non-clinical data)
 */
export function clientScopeCondition(
  scope: DataScope,
  clientIdColumn: Column,
  orgIdColumn: Column,
  orgId: string,
  allowBasicOnly = false,
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

  if (scope.type === 'basic_only' && allowBasicOnly) {
    return orgFilter;
  }

  throw new ForbiddenError('You do not have access to this data');
}

/**
 * Strips clinical/sensitive fields from a record.
 * Used for admin_staff who can see basic info but not clinical content.
 */
export function stripClinicalFields<T extends Record<string, unknown>>(
  record: T,
  clinicalFields: string[],
): Partial<T> {
  const result = { ...record };
  for (const field of clinicalFields) {
    if (field in result) {
      delete result[field];
    }
  }
  return result;
}

/** Clinical fields for client profiles */
export const CLIENT_PROFILE_CLINICAL_FIELDS = [
  'medicalHistory', 'familyBackground', 'presentingIssues', 'notes',
];

/** Clinical fields for appointments (strip counselor notes) */
export const APPOINTMENT_CLINICAL_FIELDS = ['notes'];
