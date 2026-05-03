import { describe, it, expect } from 'vitest';
import { envSchema } from './env.js';

/**
 * env.ts validation invariants — pinned by W0.3 (security audit 2026-05-03).
 *
 * Why these tests exist: prior to this fix, JWT_SECRET had a hardcoded
 * default `'psynote-dev-secret-change-in-production'`. The hard-fail at
 * env.ts only triggered when NODE_ENV === 'production' AND the value
 * exactly matched the default literal. Any other environment (test,
 * staging, missing env var, container misconfig) silently booted with
 * the publicly-known default secret — at which point anyone reading the
 * public repo could forge JWTs (including isSystemAdmin: true tokens).
 *
 * These tests pin: (1) JWT_SECRET is required, (2) it must be ≥ 32 chars,
 * (3) no fallback default exists. Any future regression that re-introduces
 * a default will fail "rejects missing JWT_SECRET".
 *
 * We test the schema directly rather than the process.exit side-effect
 * path because vitest's vi.resetModules + dynamic import is unreliable
 * for ESM modules and the schema is pure-functional.
 */

const validBaseEnv = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  NODE_ENV: 'test',
};

describe('envSchema JWT_SECRET validation', () => {
  it('rejects missing JWT_SECRET', () => {
    const result = envSchema.safeParse({ ...validBaseEnv });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.JWT_SECRET).toBeDefined();
    }
  });

  it('rejects JWT_SECRET shorter than 32 chars', () => {
    const result = envSchema.safeParse({ ...validBaseEnv, JWT_SECRET: 'short-secret' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors.JWT_SECRET;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!.some((e) => e.includes('32'))).toBe(true);
    }
  });

  it('rejects JWT_SECRET that is exactly 31 chars', () => {
    const result = envSchema.safeParse({ ...validBaseEnv, JWT_SECRET: 'a'.repeat(31) });
    expect(result.success).toBe(false);
  });

  it('accepts JWT_SECRET exactly 32 chars', () => {
    const result = envSchema.safeParse({ ...validBaseEnv, JWT_SECRET: 'a'.repeat(32) });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_SECRET).toBe('a'.repeat(32));
    }
  });

  it('accepts JWT_SECRET longer than 32 chars', () => {
    const result = envSchema.safeParse({ ...validBaseEnv, JWT_SECRET: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_SECRET.length).toBe(64);
    }
  });

  it('regression guard: schema does NOT have any string default for JWT_SECRET', () => {
    // If a future commit re-introduces `JWT_SECRET: z.string().default(...)`,
    // this test fails — because then missing JWT_SECRET would parse OK.
    const result = envSchema.safeParse({ ...validBaseEnv });
    expect(result.success).toBe(false);
  });

  it('regression guard: the historical literal default is not silently used', () => {
    // The literal 'psynote-dev-secret-change-in-production' was committed in
    // git history. If anyone re-introduces it as a fallback or default, this
    // test fails because the missing-JWT_SECRET case would yield it as data.
    const result = envSchema.safeParse({ ...validBaseEnv });
    if (result.success) {
      expect((result.data as { JWT_SECRET: string }).JWT_SECRET).not.toBe(
        'psynote-dev-secret-change-in-production',
      );
    }
    // Stronger assertion: missing must reject, period.
    expect(result.success).toBe(false);
  });
});
