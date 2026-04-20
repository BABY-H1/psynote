import React, { createContext, useContext } from 'react';
import { useAuthStore } from '../../stores/authStore';

/**
 * The 6 knowledge-base resources surfaced by the shared library UI
 * (`/knowledge/*` for org users, `/admin/library/*` for the system admin).
 * Kept in one place so the tab list, route table, and API resolver all
 * agree on which resources exist.
 */
export type LibraryResource =
  | 'scales'
  | 'goals'
  | 'agreements'
  | 'schemes'
  | 'courses'
  | 'templates';

/**
 * Org-side API paths. Historical: each resource picked its own name when
 * its route file was first written, so the names don't line up with the
 * admin side 1:1 (e.g. `goal-library` vs `goals`). The mapping below is
 * the only place that asymmetry needs to be reconciled.
 */
const ORG_RESOURCE_PATHS: Record<LibraryResource, string> = {
  scales: 'scales',
  goals: 'goal-library',
  agreements: 'compliance/consent-templates',
  schemes: 'group-schemes',
  courses: 'courses',
  templates: 'note-templates',
};

/**
 * Admin-side API paths — flat under `/api/admin/library`. Defined in
 * `server/src/modules/admin/admin-library.routes.ts`.
 */
const ADMIN_RESOURCE_PATHS: Record<LibraryResource, string> = {
  scales: 'scales',
  goals: 'goals',
  agreements: 'agreements',
  schemes: 'schemes',
  courses: 'courses',
  templates: 'templates',
};

/**
 * Context that lets a subtree (typically the admin library routes) force
 * the scope to 'system', overriding any implicit org/admin decision based
 * on auth state. This matters for a sysadmin who also belongs to an org:
 * without the context override, calling `/admin/library/scales` would
 * resolve through `currentOrgId` and hit the org endpoint.
 *
 * Default is `undefined` → fall back to auth-state-based resolution.
 */
const LibraryScopeContext = createContext<'system' | 'org' | undefined>(undefined);

export const SystemLibraryScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  React.createElement(LibraryScopeContext.Provider, { value: 'system' }, children)
);

/**
 * Internal: resolve scope, preferring the context override.
 *
 * NOT a hook — callable from react-query mutation bodies. Reads auth via
 * `getState()` which is a non-reactive snapshot; the caller's query key
 * should include `libraryScopeKey()` so React Query refetches on scope flip.
 */
function resolveScope(overrideFromContext?: 'system' | 'org'): 'system' | 'org' {
  if (overrideFromContext) return overrideFromContext;
  const { currentOrgId, isSystemAdmin } = useAuthStore.getState();
  if (!currentOrgId && isSystemAdmin) return 'system';
  return 'org';
}

/**
 * Returns the API prefix for a knowledge-library resource under the current
 * auth context. Plain function — can be called from mutation bodies.
 *
 * When called from inside `SystemLibraryScopeProvider`, context would
 * normally be available via `useContext`, but since this is a plain
 * function we can't read context. The `useLibraryApi()` hook variant is
 * the context-aware version; plain `libraryApi()` falls back to auth
 * state which is correct for the common case (sysadmin with no
 * currentOrgId, the only path that currently renders admin library).
 */
export function libraryApi(resource: LibraryResource): string {
  const scope = resolveScope();
  if (scope === 'system') {
    return `/admin/library/${ADMIN_RESOURCE_PATHS[resource]}`;
  }
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}/${ORG_RESOURCE_PATHS[resource]}`;
}

/**
 * Hook form of `libraryApi` — respects `SystemLibraryScopeProvider` and
 * re-renders on auth / scope flip. Use this inside React components and
 * react-query `queryFn` bodies. (Mutation bodies can use the plain
 * `libraryApi()` since they run on demand, not reactively.)
 */
export function useLibraryApi(): (resource: LibraryResource) => string {
  const ctx = useContext(LibraryScopeContext);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
  const scope: 'system' | 'org' = ctx ?? (!currentOrgId && isSystemAdmin ? 'system' : 'org');
  return (resource: LibraryResource) => {
    if (scope === 'system') return `/admin/library/${ADMIN_RESOURCE_PATHS[resource]}`;
    return `/orgs/${currentOrgId}/${ORG_RESOURCE_PATHS[resource]}`;
  };
}

/**
 * Stable key that changes when the scope flips between system and org.
 * Use as part of a react-query `queryKey` so caches don't bleed across
 * scopes when, say, a platform admin switches into a tenant.
 */
export function libraryScopeKey(): 'system' | string | null {
  const { currentOrgId, isSystemAdmin } = useAuthStore.getState();
  if (!currentOrgId && isSystemAdmin) return 'system';
  return currentOrgId;
}

/**
 * React hook — re-renders when scope flips. Components use this to decide
 * whether to render system-admin-only affordances (like the distribution
 * scope badge).
 */
export function useIsSystemLibraryScope(): boolean {
  const ctx = useContext(LibraryScopeContext);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const isSystemAdmin = useAuthStore((s) => s.isSystemAdmin);
  if (ctx) return ctx === 'system';
  return !currentOrgId && isSystemAdmin;
}
