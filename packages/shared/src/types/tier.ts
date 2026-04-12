/**
 * Phase 7a — SaaS tier & feature flag taxonomy.
 *
 * psynote orgs map their `organizations.plan` column (`free` / `pro` /
 * `enterprise`) onto a richer logical `OrgTier` space that decides which
 * feature set is available. The mapping is intentionally deterministic and
 * static — we do NOT store a separate feature table in the DB. This keeps
 * Phase 7 minimal while still giving the product a clean axis of differentiation.
 *
 * Four tiers:
 *   solo       — individual counselor / free plan. Core features only.
 *   team       — small practice / paid "team" plan. + supervisor + branding.
 *   enterprise — large org / paid "enterprise" plan. + EAP + audit log + SSO.
 *   platform   — multi-tenant reseller / internal admin. + public API.
 *
 * Features are opaque string IDs grouped by what they gate:
 *   core       — base psynote functionality (always on, listed for explicitness)
 *   supervisor — supervisor / supervisee relationships + oversight
 *   branding   — custom logo, theme color, report header/footer (Phase 7b)
 *   eap        — employer / EAP partnership workflows
 *   audit_log  — queryable audit_logs page (the table already exists; this
 *                gates who can READ it via the UI)
 *   sso        — SAML / OIDC single sign-on
 *   api        — public REST API access for third-party integrations
 */

export type OrgTier = 'solo' | 'team' | 'enterprise' | 'platform';

export type Feature =
  | 'core'
  | 'supervisor'
  | 'branding'
  | 'eap'
  | 'audit_log'
  | 'sso'
  | 'api';

/**
 * Static tier → feature set mapping. A feature is available iff it appears in
 * the Set for the current tier. Upgrades are always additive — tier N's set
 * is always a subset of tier N+1's.
 */
export const TIER_FEATURES: Record<OrgTier, ReadonlySet<Feature>> = {
  solo: new Set<Feature>(['core']),
  team: new Set<Feature>(['core', 'supervisor', 'branding']),
  enterprise: new Set<Feature>([
    'core',
    'supervisor',
    'branding',
    'eap',
    'audit_log',
    'sso',
  ]),
  platform: new Set<Feature>([
    'core',
    'supervisor',
    'branding',
    'eap',
    'audit_log',
    'sso',
    'api',
  ]),
};

/**
 * Check whether a given tier includes a given feature. Pure, cheap, safe to
 * call in a render loop.
 *
 * ```ts
 * hasFeature('team', 'branding')     // true
 * hasFeature('solo', 'branding')     // false
 * hasFeature('enterprise', 'api')    // false
 * hasFeature('platform', 'api')      // true
 * ```
 */
export function hasFeature(tier: OrgTier, feature: Feature): boolean {
  // Defensive fallback: if a stale/unknown tier slips in (e.g. raw DB plan
  // string like 'pro' instead of the mapped OrgTier, or a legacy value from
  // localStorage), treat it as 'solo' rather than crashing the whole shell.
  const set = TIER_FEATURES[tier] ?? TIER_FEATURES.solo;
  return set.has(feature);
}

/**
 * Map the raw `organizations.plan` DB value (which uses the old SaaS terminology
 * 'free' / 'pro' / 'enterprise') to an `OrgTier`. Unknown values default to 'solo'.
 * See `docs/refactor-terminology.md` section 8 for the table.
 */
export function planToTier(plan: string | null | undefined): OrgTier {
  switch (plan) {
    case 'free':
      return 'solo';
    case 'pro':
      return 'team';
    case 'enterprise':
      return 'enterprise';
    case 'platform':
      return 'platform';
    default:
      return 'solo';
  }
}

// ---------------------------------------------------------------------------
// License info — shared between server responses and client state
// ---------------------------------------------------------------------------

export type LicenseStatus = 'active' | 'expired' | 'invalid' | 'none';

export interface LicenseInfo {
  status: LicenseStatus;
  maxSeats: number | null;
  expiresAt: string | null;
}

/**
 * Human-readable tier labels for UI display.
 */
export const TIER_LABELS: Record<OrgTier, string> = {
  solo: '个人版',
  team: '团队版',
  enterprise: '企业版',
  platform: '平台版',
};
