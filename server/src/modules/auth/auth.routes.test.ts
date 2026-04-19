import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

/**
 * Auth routes — focused on the POST /login security invariants.
 *
 * Why the `passwordHash` nullability tests exist:
 *   Prior to this file, auth.routes.ts line 92 read
 *     `if (user.passwordHash) { bcrypt.compare(...) }`
 *   — meaning any account row whose `password_hash` column is NULL would
 *   authenticate with ANY password. Comment said "for migration", but
 *   nothing on the import/provisioning side ever creates such rows
 *   in real workflows, and the branch was a trivial account takeover
 *   primitive for anyone with direct DB access or a malicious migration.
 *
 * These tests pin the fail-closed behavior and stand guard against any
 * future "migration convenience" rollback.
 */

// ─── DB mock — FIFO queue that any terminal chain call drains ───

const dbResults: unknown[][] = [];

function terminal(rows: unknown[]): any {
  const p: any = Promise.resolve(rows);
  p.limit = () => Promise.resolve(rows);
  p.returning = () => Promise.resolve(rows);
  return p;
}

vi.mock('../../config/database.js', () => {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => terminal(dbResults.shift() ?? []));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => terminal(dbResults.shift() ?? []));
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

// Import AFTER mocks are installed.
const { authRoutes } = await import('./auth.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  dbResults.length = 0;
});

describe('POST /login', () => {
  it('rejects login when stored user row has NULL passwordHash (no silent any-password bypass)', async () => {
    // Legacy-shaped row: passwordHash column is null. Before the fix this
    // authenticated with ANY password; after, it must fail closed.
    dbResults.push([
      { id: 'u1', email: 'legacy@example.com', name: 'Legacy', passwordHash: null, isSystemAdmin: false },
    ]);

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'legacy@example.com', password: 'literally-anything' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      // Message intentionally indistinguishable from "password wrong" so the
      // client can't probe for legacy accounts.
      expect(body.message).toMatch(/邮箱或密码错误|账户未激活/);
    } finally {
      await app.close();
    }
  });

  it('rejects login when stored passwordHash is an empty string (same attack surface)', async () => {
    dbResults.push([
      { id: 'u2', email: 'empty@example.com', name: 'Empty', passwordHash: '', isSystemAdmin: false },
    ]);

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'empty@example.com', password: 'whatever' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('accepts login with a valid bcrypt-matched password (regression guard)', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    dbResults.push([
      { id: 'u3', email: 'real@example.com', name: 'Real', passwordHash: hash, isSystemAdmin: false },
    ]);

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'real@example.com', password: 'correct-horse' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.user.id).toBe('u3');
    } finally {
      await app.close();
    }
  });

  it('rejects login with a bcrypt-mismatched password', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    dbResults.push([
      { id: 'u4', email: 'real2@example.com', name: 'Real2', passwordHash: hash, isSystemAdmin: false },
    ]);

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'real2@example.com', password: 'wrong' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects login for a nonexistent email with the same error shape as wrong password', async () => {
    dbResults.push([]); // no row

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'ghost@example.com', password: 'x' },
      });
      expect(res.statusCode).toBe(400);
      // Must not leak whether the email exists — same message as
      // wrong-password case.
      expect(res.json().message).toMatch(/邮箱或密码错误/);
    } finally {
      await app.close();
    }
  });
});
