import React from 'react';
import { Lock } from 'lucide-react';
import { useHasFeature } from '../hooks/useFeature';
import type { Feature, OrgTier } from '@psynote/shared';
import { TIER_LABELS } from '@psynote/shared';

/**
 * Phase 7a — Declarative feature gate.
 *
 * Wraps children that should only render when the current org's tier includes
 * a given feature. Three modes:
 *
 *   default   — render nothing when locked
 *   fallback  — render the provided `<fallback>` JSX when locked
 *   upsell    — render a friendly "upgrade to {requiredTier}" card when locked
 *
 * ```tsx
 * <FeatureGate feature="branding">
 *   <OrgBrandingSettings />
 * </FeatureGate>
 *
 * <FeatureGate feature="branding" mode="upsell" requiredTier="team">
 *   <OrgBrandingSettings />
 * </FeatureGate>
 * ```
 */

interface Props {
  feature: Feature;
  children: React.ReactNode;
  /** How to render when the feature is not available */
  mode?: 'hidden' | 'fallback' | 'upsell';
  /** JSX shown when `mode="fallback"` */
  fallback?: React.ReactNode;
  /** Shown in the upsell card so the user knows which plan to pick */
  requiredTier?: OrgTier;
  /** Optional friendly name for the feature in upsell copy */
  featureLabel?: string;
}

export function FeatureGate({
  feature,
  children,
  mode = 'hidden',
  fallback,
  requiredTier,
  featureLabel,
}: Props) {
  const has = useHasFeature(feature);
  if (has) return <>{children}</>;

  if (mode === 'hidden') return null;
  if (mode === 'fallback') return <>{fallback ?? null}</>;

  // upsell
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
        <Lock className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800">
        {featureLabel || '此功能'}需要升级订阅
      </h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
        {requiredTier
          ? `升级到 ${TIER_LABELS[requiredTier]} 即可使用${featureLabel || '此功能'}。`
          : '当前订阅计划不包含此功能，请联系管理员升级。'}
      </p>
    </div>
  );
}
