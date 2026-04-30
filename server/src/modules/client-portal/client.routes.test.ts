import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { clientPortalRoutes } from './client.routes.js';

/**
 * Characterization: the full set of (method, path) pairs that the
 * client-portal surface exposes. The upcoming module split must preserve
 * every route exactly — if any endpoint is dropped or renamed, this test
 * fails with a diff.
 */
describe('clientPortalRoutes — route registration contract', () => {
  it('registers the expected set of (method, path) pairs', async () => {
    const app = Fastify();
    const collected: Array<{ method: string; path: string }> = [];

    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) {
        const method = String(m).toUpperCase();
        // Fastify auto-registers HEAD companions for GET routes; these are
        // framework-generated, not authored endpoints. Exclude from the
        // contract so the snapshot only reflects intentional declarations.
        if (method === 'HEAD') continue;
        collected.push({ method, path: route.url });
      }
    });

    await app.register(clientPortalRoutes);
    await app.ready();
    await app.close();

    const sorted = collected
      .map(({ method, path }) => `${method} ${path}`)
      .sort();

    expect(sorted).toEqual([
      'GET /appointments',
      'GET /consents',
      'GET /counselors',
      'GET /courses',
      'GET /courses/:courseId',
      'GET /dashboard',
      'GET /documents',
      'GET /documents/:docId',
      'GET /groups',
      'GET /groups/:instanceId',
      'GET /my-assessments',
      'GET /my-courses',
      'GET /my-groups',
      'GET /referrals',
      'GET /results',
      'GET /results/:resultId',
      'GET /results/trajectory/:scaleId',
      'GET /timeline',
      'POST /appointment-requests',
      'POST /consents/:consentId/revoke',
      'POST /documents/:docId/sign',
      'POST /groups/:instanceId/sessions/:sessionRecordId/check-in',
      'POST /referrals/:referralId/consent',
    ]);
  });

  it('registers exactly 23 authored endpoints (no drift)', async () => {
    const app = Fastify();
    let count = 0;
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) {
        if (String(m).toUpperCase() === 'HEAD') continue;
        count++;
      }
    });
    await app.register(clientPortalRoutes);
    await app.ready();
    await app.close();
    expect(count).toBe(23);
  });
});
