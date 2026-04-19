import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-A.3 · EAP compliance boundary (HR / enterprise org_admin).
 *
 * Scope note (honest): a full "HR cannot see individual employee PHI"
 * assertion requires (1) seeding an enterprise employee + their
 * client_profiles row, and (2) NODE_ENV=production so the dev-mode
 * x-dev-role bypass in org-context.ts:134-157 doesn't mask membership
 * rejection. Both are future work.
 *
 * What these tests DO pin: the positive aggregate paths — any accidental
 * regression on EAP route mount or on aggregate_only scope resolution
 * fails here. The NEGATIVE side (intra-tenant clinical PHI denied) is
 * covered at the middleware layer in data-scope.test.ts.
 *
 * Logins pooled in beforeAll to stay under the Fastify auth rate limiter
 * when the whole smoke suite runs.
 */

const API_BASE = 'http://localhost:4000';

test.describe('EAP compliance boundary — Phase-A.3', () => {
  let apiReq: APIRequestContext;
  let hrToken: string;
  let enterpriseOrgId: string;

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
    const loginRes = await apiReq.post('/api/auth/login', {
      data: { email: 'hr@sinopec-eap.com', password: 'admin123' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = await loginRes.json();
    hrToken = accessToken;

    const orgsRes = await apiReq.get('/api/orgs', {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    expect(orgsRes.ok()).toBeTruthy();
    const orgs = (await orgsRes.json()) as Array<{ id: string; settings?: { orgType?: string } }>;
    const enterprise = orgs.find((o) => o.settings?.orgType === 'enterprise') ?? orgs[0];
    enterpriseOrgId = enterprise.id;
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  test('HR reads /eap/analytics/overview successfully', async () => {
    const res = await apiReq.get(
      `/api/orgs/${enterpriseOrgId}/eap/analytics/overview`,
      { headers: { Authorization: `Bearer ${hrToken}` } },
    );
    expect(res.status()).toBe(200);
  });

  test('HR reads /eap/analytics/risk-distribution successfully', async () => {
    const res = await apiReq.get(
      `/api/orgs/${enterpriseOrgId}/eap/analytics/risk-distribution`,
      { headers: { Authorization: `Bearer ${hrToken}` } },
    );
    expect(res.status()).toBe(200);
  });
});
