import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-B.2 · /api/public/* security baseline.
 *
 * What's pinned here: the 3 public prefixes (`parent-bind`, `eap`,
 * `assessments`) reject malformed / unknown input with the RIGHT HTTP
 * status before ever touching a DB row (parent-bind) or before touching
 * anything expensive (eap, assessments). Drift on any of these lets a
 * scraper hammer the surface and glean existence info.
 *
 * Pure API — no login needed (these are unauthenticated endpoints).
 * Fresh context per describe so no cookie / token pollution.
 *
 * Notes on coverage scope:
 *   - The oversized-body (>1MB) anti-DoS check is NOT included: the
 *     current error handler lacks a FastifyError→413 branch, so a
 *     payload-too-large error would fall through to 500 (pre-existing
 *     debt — flagged in plan, fix separately).
 *   - The positive bind-with-valid-token path (anti-impersonation 3-field
 *     check) is covered in B.3 where we seed a class + invite token.
 */

const API_BASE = 'http://localhost:4000';

test.describe('public endpoints — security baseline (Phase-B.2)', () => {
  let apiReq: APIRequestContext;

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  // ── /api/public/parent-bind/:token ────────────────────────────────

  test('parent-bind preview with unknown token returns 404', async () => {
    const res = await apiReq.get('/api/public/parent-bind/this-token-does-not-exist');
    expect(res.status()).toBe(404);
  });

  test('parent-bind submit with unknown token returns 404 (no leak of field-level validation)', async () => {
    // Even with a well-formed body, an invalid token must 404 first —
    // otherwise an attacker can distinguish "bad token" from "wrong
    // student fields" by the error shape.
    const res = await apiReq.post('/api/public/parent-bind/this-token-does-not-exist', {
      data: {
        studentName: '李同学',
        studentNumber: 'S12345',
        phoneLast4: '1234',
        relation: 'guardian',
        myName: '李妈妈',
        password: 'admin123',
      },
    });
    expect(res.status()).toBe(404);
  });

  // ── /api/public/eap/:orgSlug/* ────────────────────────────────────

  test('EAP info lookup on unknown slug returns 404', async () => {
    const res = await apiReq.get('/api/public/eap/this-slug-does-not-exist/info');
    expect(res.status()).toBe(404);
  });

  test('EAP register on unknown slug returns 404 (org resolution fails before side effects)', async () => {
    const res = await apiReq.post('/api/public/eap/this-slug-does-not-exist/register', {
      data: {
        name: 'Test User',
        email: `newbie+${Date.now()}@example.com`,
        password: 'admin123',
      },
    });
    expect(res.status()).toBe(404);
  });

  test('EAP register with missing required fields returns 400 (validation fires before org lookup)', async () => {
    // slug can be bogus — the validation branch runs first.
    const res = await apiReq.post('/api/public/eap/any-slug/register', {
      data: { name: '', email: '', password: '' },
    });
    expect(res.status()).toBe(400);
  });

  // ── /api/public/assessments/:assessmentId/submit ──────────────────

  test('public assessment submit with empty answers returns 400', async () => {
    const res = await apiReq.post('/api/public/assessments/00000000-0000-0000-0000-000000000000/submit', {
      data: { answers: {} },
    });
    expect(res.status()).toBe(400);
  });
});
