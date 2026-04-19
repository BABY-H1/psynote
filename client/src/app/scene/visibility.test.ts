import { describe, it, expect } from 'vitest';
import { isVisible, type SceneContext, type SceneVisibility } from './visibility';

/**
 * Pure-function tests for the scene visibility predicate.
 * Zero mocks, zero DB — just `(visibility, context) → boolean`.
 */

const ctx = (patch: Partial<SceneContext> = {}): SceneContext => ({
  orgType: 'counseling',
  role: 'org_admin',
  tier: 'growth',
  ...patch,
});

describe('isVisible — no visibility rules', () => {
  it('empty rules → always visible', () => {
    expect(isVisible({}, ctx())).toBe(true);
    expect(isVisible({}, ctx({ orgType: null, role: null, tier: null }))).toBe(true);
  });
});

describe('isVisible — hideForOrgTypes', () => {
  const v: SceneVisibility = { hideForOrgTypes: ['solo'] };
  it('hides when orgType matches', () => {
    expect(isVisible(v, ctx({ orgType: 'solo' }))).toBe(false);
  });
  it('shows when orgType differs', () => {
    expect(isVisible(v, ctx({ orgType: 'counseling' }))).toBe(true);
    expect(isVisible(v, ctx({ orgType: 'school' }))).toBe(true);
  });
  it('shows when orgType is null (defensive default = visible)', () => {
    expect(isVisible(v, ctx({ orgType: null }))).toBe(true);
  });
});

describe('isVisible — onlyForOrgTypes', () => {
  const v: SceneVisibility = { onlyForOrgTypes: ['school'] };
  it('hides non-matching orgType', () => {
    expect(isVisible(v, ctx({ orgType: 'counseling' }))).toBe(false);
    expect(isVisible(v, ctx({ orgType: 'enterprise' }))).toBe(false);
  });
  it('shows matching orgType', () => {
    expect(isVisible(v, ctx({ orgType: 'school' }))).toBe(true);
  });
  it('hides null orgType (strict gate)', () => {
    expect(isVisible(v, ctx({ orgType: null }))).toBe(false);
  });
});

describe('isVisible — onlyForRoles', () => {
  const v: SceneVisibility = { onlyForRoles: ['org_admin', 'counselor'] };
  it('shows allowed role', () => {
    expect(isVisible(v, ctx({ role: 'counselor' }))).toBe(true);
    expect(isVisible(v, ctx({ role: 'org_admin' }))).toBe(true);
  });
  it('hides disallowed role', () => {
    expect(isVisible(v, ctx({ role: 'client' }))).toBe(false);
  });
  it('hides null role', () => {
    expect(isVisible(v, ctx({ role: null }))).toBe(false);
  });
});

describe('isVisible — adminOnly', () => {
  it('adminOnly hides non-admin', () => {
    expect(isVisible({ adminOnly: true }, ctx({ role: 'counselor' }))).toBe(false);
    expect(isVisible({ adminOnly: true }, ctx({ role: 'client' }))).toBe(false);
  });
  it('adminOnly shows org_admin', () => {
    expect(isVisible({ adminOnly: true }, ctx({ role: 'org_admin' }))).toBe(true);
  });
  it('adminOnly + soloAsAdmin lets solo users through even when not org_admin', () => {
    // (in practice solo IS the org_admin, but the predicate must also handle
    // edge cases where role hasn't loaded yet and orgType=solo is enough)
    expect(
      isVisible(
        { adminOnly: true, soloAsAdmin: true },
        ctx({ role: 'counselor', orgType: 'solo' }),
      ),
    ).toBe(true);
  });
  it('adminOnly WITHOUT soloAsAdmin blocks non-admin even if orgType=solo', () => {
    expect(
      isVisible({ adminOnly: true }, ctx({ role: 'counselor', orgType: 'solo' })),
    ).toBe(false);
  });
});

describe('isVisible — requiresFeature', () => {
  it('hides if tier is null', () => {
    expect(
      isVisible({ requiresFeature: 'branding' }, ctx({ tier: null })),
    ).toBe(false);
  });
  it('hides if tier does not grant the feature', () => {
    expect(
      isVisible({ requiresFeature: 'partnership' }, ctx({ tier: 'growth' })),
    ).toBe(false);
  });
  it('shows if tier grants the feature', () => {
    expect(
      isVisible({ requiresFeature: 'branding' }, ctx({ tier: 'growth' })),
    ).toBe(true);
    expect(
      isVisible({ requiresFeature: 'partnership' }, ctx({ tier: 'flagship' })),
    ).toBe(true);
  });
  it('orgType-feature (eap) is granted by enterprise orgType even on starter', () => {
    expect(
      isVisible(
        { requiresFeature: 'eap' },
        ctx({ tier: 'starter', orgType: 'enterprise' }),
      ),
    ).toBe(true);
    expect(
      isVisible(
        { requiresFeature: 'eap' },
        ctx({ tier: 'starter', orgType: 'counseling' }),
      ),
    ).toBe(false);
  });
});

describe('isVisible — multiple rules combine with AND', () => {
  const v: SceneVisibility = {
    adminOnly: true,
    hideForOrgTypes: ['solo'],
    requiresFeature: 'branding',
  };
  it('all conditions pass → visible', () => {
    expect(
      isVisible(v, ctx({ role: 'org_admin', orgType: 'counseling', tier: 'growth' })),
    ).toBe(true);
  });
  it('any condition fails → hidden', () => {
    // admin but solo orgType excluded
    expect(
      isVisible(v, ctx({ role: 'org_admin', orgType: 'solo', tier: 'growth' })),
    ).toBe(false);
    // admin counseling but tier too low for branding
    expect(
      isVisible(v, ctx({ role: 'org_admin', orgType: 'counseling', tier: 'starter' })),
    ).toBe(false);
  });
});
