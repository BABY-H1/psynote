import { describe, it, expect } from 'vitest';
import {
  hasFeature,
  hasOrgTypeFeature,
  planToTier,
  tierToPlan,
  getOrgTypeDisplay,
  TIER_FEATURES,
  ORG_TYPE_FEATURES,
} from './tier.js';

describe('tier hierarchy (starter ⊂ growth ⊂ flagship)', () => {
  it('every starter feature is present in growth', () => {
    for (const f of TIER_FEATURES.starter) {
      expect(TIER_FEATURES.growth.has(f)).toBe(true);
    }
  });

  it('every growth feature is present in flagship', () => {
    for (const f of TIER_FEATURES.growth) {
      expect(TIER_FEATURES.flagship.has(f)).toBe(true);
    }
  });

  it('flagship strictly extends growth (partnership/sso/api are flagship-only)', () => {
    for (const extra of ['partnership', 'sso', 'api'] as const) {
      expect(TIER_FEATURES.growth.has(extra)).toBe(false);
      expect(TIER_FEATURES.flagship.has(extra)).toBe(true);
    }
  });
});

describe('hasFeature', () => {
  it('starter does NOT include supervisor', () => {
    expect(hasFeature('starter', 'supervisor')).toBe(false);
  });

  it('growth DOES include supervisor', () => {
    expect(hasFeature('growth', 'supervisor')).toBe(true);
  });

  it('starter + enterprise orgType unlocks eap feature', () => {
    // tier alone does not grant eap
    expect(hasFeature('starter', 'eap')).toBe(false);
    // but enterprise orgType adds it regardless of tier
    expect(hasFeature('starter', 'eap', 'enterprise')).toBe(true);
  });

  it('flagship has partnership / sso / api', () => {
    expect(hasFeature('flagship', 'partnership')).toBe(true);
    expect(hasFeature('flagship', 'sso')).toBe(true);
    expect(hasFeature('flagship', 'api')).toBe(true);
  });

  it('growth does NOT have partnership / sso / api', () => {
    expect(hasFeature('growth', 'partnership')).toBe(false);
    expect(hasFeature('growth', 'sso')).toBe(false);
    expect(hasFeature('growth', 'api')).toBe(false);
  });
});

describe('hasOrgTypeFeature', () => {
  it('enterprise has eap; others do not', () => {
    expect(hasOrgTypeFeature('enterprise', 'eap')).toBe(true);
    expect(hasOrgTypeFeature('counseling', 'eap')).toBe(false);
    expect(hasOrgTypeFeature('school', 'eap')).toBe(false);
  });

  it('school has school feature; others do not', () => {
    expect(hasOrgTypeFeature('school', 'school')).toBe(true);
    expect(hasOrgTypeFeature('enterprise', 'school')).toBe(false);
  });
});

describe('planToTier', () => {
  it("'free' → starter", () => {
    expect(planToTier('free')).toBe('starter');
  });

  it("'pro' → growth", () => {
    expect(planToTier('pro')).toBe('growth');
  });

  it("legacy 'enterprise' → growth", () => {
    expect(planToTier('enterprise')).toBe('growth');
  });

  it("'premium' → flagship and legacy 'platform' → flagship", () => {
    expect(planToTier('premium')).toBe('flagship');
    expect(planToTier('platform')).toBe('flagship');
  });

  it('null / undefined / unknown → starter (safe fallback)', () => {
    expect(planToTier(null)).toBe('starter');
    expect(planToTier(undefined)).toBe('starter');
    expect(planToTier('bogus-tier-name')).toBe('starter');
  });
});

describe('tierToPlan round-trip', () => {
  it("tierToPlan(planToTier('pro')) === 'pro'", () => {
    expect(tierToPlan(planToTier('pro'))).toBe('pro');
  });

  it("tierToPlan(planToTier('premium')) === 'premium'", () => {
    expect(tierToPlan(planToTier('premium'))).toBe('premium');
  });

  it("tierToPlan(planToTier(null)) === 'free' (fallback round-trip)", () => {
    expect(tierToPlan(planToTier(null))).toBe('free');
  });
});

describe('getOrgTypeDisplay', () => {
  it('known orgType returns its own display config', () => {
    expect(getOrgTypeDisplay('enterprise').badge).toBe('企业');
    expect(getOrgTypeDisplay('school').badge).toBe('学校');
  });

  it('null / undefined / unknown falls back to counseling', () => {
    expect(getOrgTypeDisplay(null).badge).toBe('机构');
    expect(getOrgTypeDisplay(undefined).badge).toBe('机构');
    expect(getOrgTypeDisplay('bogus-org-type').badge).toBe('机构');
  });
});

describe('ORG_TYPE_FEATURES shape', () => {
  it('counseling / solo / hospital have no orgType features', () => {
    expect(ORG_TYPE_FEATURES.counseling.size).toBe(0);
    expect(ORG_TYPE_FEATURES.solo.size).toBe(0);
    expect(ORG_TYPE_FEATURES.hospital.size).toBe(0);
  });
});
