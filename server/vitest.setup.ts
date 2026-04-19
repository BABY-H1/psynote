// Inject env vars BEFORE server/src/config/env.ts is imported for the first time.
// env.ts calls process.exit(1) on missing DATABASE_URL, which would kill vitest.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-please-change';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
