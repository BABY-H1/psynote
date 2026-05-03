// Inject env vars BEFORE server/src/config/env.ts is imported for the first time.
// env.ts calls process.exit(1) on missing DATABASE_URL or short JWT_SECRET,
// which would kill vitest.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/test';
// JWT_SECRET min 32 chars enforced by env.ts (security audit W0.3, 2026-05-03).
// This test value is 36 chars and is a regular test fixture, not a real secret.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-32-or-more-chars-xyz';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
