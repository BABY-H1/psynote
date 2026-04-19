/**
 * Phase 7a — Feature flag React hook.
 *
 * Subscribes to `currentOrgTier` in the auth store and returns a stable
 * predicate `(feature) => boolean`. Rebuilds only when the tier changes.
 *
 * ```tsx
 * const hasFeature = useFeature();
 * if (hasFeature('branding')) { ... }
 * ```
 *
 * Also see `<FeatureGate feature="branding">` for declarative conditional
 * rendering.
 */

import { useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { hasFeature, type Feature, type OrgTier } from '@psynote/shared';

export function useFeature() {
  const tier = useAuthStore((s) => s.currentOrgTier);
  return useMemo(() => {
    // Default to 'starter' (the most restrictive tier) if tier hasn't loaded
    // yet. This avoids flashes of premium-only UI while the auth hydrates.
    const effectiveTier: OrgTier = tier ?? 'starter';
    return (feature: Feature) => hasFeature(effectiveTier, feature);
  }, [tier]);
}

/**
 * Sugar: check a single feature without building a closure.
 * ```ts
 * const canBrand = useHasFeature('branding');
 * ```
 */
export function useHasFeature(feature: Feature): boolean {
  const tier = useAuthStore((s) => s.currentOrgTier);
  const effectiveTier: OrgTier = tier ?? 'starter';
  return hasFeature(effectiveTier, feature);
}

/** Read the current tier directly (with a 'starter' default — the most restrictive tier). */
export function useCurrentTier(): OrgTier {
  return useAuthStore((s) => s.currentOrgTier) ?? 'starter';
}
