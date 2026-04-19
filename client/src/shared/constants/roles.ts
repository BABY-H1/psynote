/**
 * Centralized role labels + badge color mapping.
 *
 * Consolidates what used to be 4 copies of `ROLE_LABELS` (AdminDashboard /
 * UserManagement / TenantDetail / MemberManagement — each with slightly
 * drifting wording) and 2 copies of the role-badge-color ternary (both
 * admin pages) into one source of truth.
 */

import type { OrgRole, OrgType } from '@psynote/shared';

/** Canonical Chinese label for each role. */
export const ROLE_LABELS: Record<OrgRole, string> = {
  org_admin: '机构管理员',
  counselor: '咨询师',
  client: '来访者',
};

/**
 * Look up a role label defensively — works with loose `string` input (e.g.
 * DB rows whose `role` column is untyped) and falls back to the raw role
 * string if unknown. Use this at UI call sites; use `ROLE_LABELS` directly
 * only when you already have a typed `OrgRole` value.
 */
export function getRoleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

/** Tailwind classes for a role badge (background + text color). */
export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'org_admin':
      return 'bg-blue-100 text-blue-700';
    case 'counselor':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

/**
 * Default orgType used as a safety fallback when the server returns an org
 * without an explicit `settings.orgType` (old seed data, migrations, etc.).
 * `counseling` is the most permissive and least specialized orgType, so
 * falling back to it won't unlock any orgType-specific features that the
 * org shouldn't have.
 */
export const DEFAULT_ORG_TYPE: OrgType = 'counseling';
