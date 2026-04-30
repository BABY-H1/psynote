/**
 * Route-registration contract for the research-triage module.
 *
 * Mirrors the pattern in client.routes.test.ts: we assert the exact set
 * of (method, path) pairs exposed under /api/orgs/:orgId/triage so that
 * future refactors can't silently drop or rename an endpoint.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

// Stub the middlewares so the route file can register without hitting DB
vi.mock('../../middleware/auth.js', () => ({
  authGuard: async () => undefined,
}));
vi.mock('../../middleware/org-context.js', () => ({
  orgContextGuard: async () => undefined,
}));
vi.mock('../../middleware/data-scope.js', () => ({
  dataScopeGuard: async () => undefined,
}));
vi.mock('../../middleware/rbac.js', () => ({
  requireRole: () => async () => undefined,
}));
vi.mock('../../middleware/audit.js', () => ({
  logAudit: vi.fn(),
  logPhiAccess: vi.fn(),
}));
vi.mock('../../config/database.js', () => ({ db: {} }));

const { triageRoutes } = await import('./triage.routes.js');

describe('triageRoutes — route registration contract', () => {
  it('registers the expected (method, path) pairs', async () => {
    const app = Fastify();
    const collected: string[] = [];
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) {
        const method = String(m).toUpperCase();
        if (method === 'HEAD') continue;
        collected.push(`${method} ${route.url}`);
      }
    });
    await app.register(triageRoutes);
    await app.ready();
    await app.close();

    expect(collected.sort()).toEqual([
      'GET /buckets',
      'GET /candidates',
      // Phase H: lazy-create candidate from a result (BUG-007 真正修复).
      // 用户从研判分流详情面板按"转个案/课程·团辅/忽略", 前端先 POST 这个
      // 端点确保有 candidate_pool 行, 再走 accept/dismiss 链.
      'PATCH /results/:resultId/risk-level',
      'POST /results/:resultId/candidate',
    ]);
  });
});
