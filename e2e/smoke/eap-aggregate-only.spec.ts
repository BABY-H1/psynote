import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-A.3 · EAP compliance boundary (HR / enterprise org_admin).
 *
 * Scope note: a full "HR cannot see individual employee PHI" assertion
 * still requires seeding an enterprise employee + their client_profiles
 * row — that's future work. With the dev-mode x-dev-role bypass now
 * removed (pre-launch security fix), membership rejection is no longer
 * masked in dev, but the intra-tenant clinical-PHI denial for HR depends
 * on route-level aggregate_only enforcement which is covered at the
 * middleware layer in data-scope.test.ts.
 *
 * What these tests pin: the positive aggregate paths — any accidental
 * regression on EAP route mount or aggregate_only scope resolution
 * fails here.
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
