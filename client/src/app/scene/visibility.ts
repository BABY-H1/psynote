/**
 * Scene visibility predicate — the single source of truth for "should this
 * UI element (nav item, settings tab, …) be visible for the current user's
 * orgType × role × tier combination?".
 *
 * Consumers declare their visibility rules as plain data (`SceneVisibility`)
 * next to the items themselves, then filter with `isVisible(v, ctx)`.
 *
 * Design notes
 * ------------
 * - `isSystemAdmin` is NOT a bypass here. sysadmin-specific UI (e.g. the
 *   "系统管理" nav link) is added out-of-band in consumers that care. This
 *   predicate is a pure function of {orgType, role, tier}.
 * - `soloAsAdmin` exists only for OrgSettingsPage's legacy quirk: a solo
 *   user (who IS the org) should see admin-only settings. Default is
 *   `false`; consumers opt in.
 * - `hideForOrgTypes` is preferred over `onlyForOrgTypes` when the rule is
 *   "exclude one orgType" — future new orgTypes default to visible, which
 *   is the safer bias for generic nav items.
 */

import type { OrgRole, OrgType, OrgTier, Feature, OrgTypeFeature } from '@psynote/shared';
import { hasFeature } from '@psynote/shared';

export interface SceneVisibility {
  /** Hide when current orgType matches any listed. */
  hideForOrgTypes?: OrgType[];
  /** Show ONLY when current orgType matches any listed. */
  onlyForOrgTypes?: OrgType[];
  /** Show ONLY when current role matches any listed. */
  onlyForRoles?: OrgRole[];
  /** Show ONLY to org_admin. Combines with `soloAsAdmin` below. */
  adminOnly?: boolean;
  /**
   * When `adminOnly: true`, also let solo users through (they ARE the org,
   * so admin-level UIs are relevant). Used by OrgSettingsPage. No other
   * consumer currently needs this.
   */
  soloAsAdmin?: boolean;
  /** Show ONLY if the tier (+ optional orgType) grants the feature. */
  requiresFeature?: Feature | OrgTypeFeature;
}

export interface SceneContext {
  orgType: OrgType | null;
  role: OrgRole | null;
  tier: OrgTier | null;
}

export function isVisible(v: SceneVisibility, ctx: SceneContext): boolean {
  if (v.hideForOrgTypes && ctx.orgType && v.hideForOrgTypes.includes(ctx.orgType)) {
    return false;
  }
  if (v.onlyForOrgTypes && (!ctx.orgType || !v.onlyForOrgTypes.includes(ctx.orgType))) {
    return false;
  }
  if (v.onlyForRoles && (!ctx.role || !v.onlyForRoles.includes(ctx.role))) {
    return false;
  }
  if (v.adminOnly) {
    const isAdmin = ctx.role === 'org_admin';
    const isSolo = ctx.orgType === 'solo';
    if (!isAdmin && !(v.soloAsAdmin && isSolo)) return false;
  }
  if (v.requiresFeature) {
    if (!ctx.tier) return false;
    if (!hasFeature(ctx.tier, v.requiresFeature, ctx.orgType ?? undefined)) return false;
  }
  return true;
}
