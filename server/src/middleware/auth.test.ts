import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { authGuard } from './auth.js';
import { errorHandler } from './error-handler.js';

/**
 * authGuard is pure JWT verification — no DB. We spin up a minimal
 * Fastify instance with authGuard on a dummy route and exercise via inject().
 */

const JWT_SECRET = process.env.JWT_SECRET!;

function sign(payload: Record<string, unknown>, opts?: jwt.SignOptions) {
  return jwt.sign(payload, JWT_SECRET, opts);
}

function buildTinyApp(): FastifyInstance {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.get('/protected', { preHandler: [authGuard] }, async (req) => ({
    ok: true,
    user: req.user,
  }));
  return app;
}

describe('authGuard', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildTinyApp();
  });

  it('rejects missing Authorization header with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-Bearer scheme with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed / unsigned token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired JWT with 401', async () => {
    const expired = sign({ sub: 'u1', email: 'u1@x' }, { expiresIn: '-1s' });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a JWT signed with the WRONG secret with 401', async () => {
    const bad = jwt.sign({ sub: 'u1', email: 'u1@x' }, 'some-other-secret');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a JWT missing `sub` with 401', async () => {
    const noSub = sign({ email: 'u1@x' });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${noSub}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid JWT and sets request.user', async () => {
    const token = sign({ sub: 'u1', email: 'alice@example.com', isSystemAdmin: false });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toEqual({
      id: 'u1',
      email: 'alice@example.com',
      isSystemAdmin: false,
    });
  });

  it('defaults isSystemAdmin to false when missing from payload', async () => {
    const token = sign({ sub: 'u2', email: 'bob@example.com' });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.isSystemAdmin).toBe(false);
  });

  it('propagates isSystemAdmin=true from JWT payload', async () => {
    const token = sign({ sub: 'sys1', email: 'sys@x', isSystemAdmin: true });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.isSystemAdmin).toBe(true);
  });

  // ─── W3.4 — Algorithm pin (defense-in-depth) ───────────────────
  // Without `algorithms: ['HS256']`, jsonwebtoken accepts any HMAC variant
  // (HS256/HS384/HS512) — algorithm confusion class CVEs (e.g. HS256↔RSA
  // key swaps) become exploitable if a future code path ever exposes a
  // public key as the JWT_SECRET. Pinning to a specific algorithm is the
  // standard defense.

  it('rejects a JWT signed with HS512 (algorithm pin = HS256 only)', async () => {
    const wrongAlg = jwt.sign({ sub: 'u1', email: 'u1@x' }, JWT_SECRET, {
      algorithm: 'HS512',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${wrongAlg}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a JWT signed with HS384 (algorithm pin = HS256 only)', async () => {
    const wrongAlg = jwt.sign({ sub: 'u1', email: 'u1@x' }, JWT_SECRET, {
      algorithm: 'HS384',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${wrongAlg}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
