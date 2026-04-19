import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-A.2 · `?as=<childUserId>` guardian impersonation boundary.
 *
 * Pure API tests. Each test's cost is ONE GET — all logins happen once
 * per describe block in `beforeAll` and tokens are reused. Without this
 * pooling the suite would punch through the Fastify auth rate limiter
 * when run alongside the other smoke specs.
 */

const API_BASE = 'http://localhost:4000';

interface LoginResp {
  accessToken: string;
  user: { id: string };
}

async function login(apiReq: APIRequestContext, email: string): Promise<LoginResp> {
  const res = await apiReq.post('/api/auth/login', {
    data: { email, password: 'admin123' },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`login failed for ${email} — status=${res.status()} body=${body.slice(0, 200)}`);
  }
  return res.json();
}

async function firstOrgId(apiReq: APIRequestContext, token: string): Promise<string> {
  const res = await apiReq.get('/api/orgs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const orgs = (await res.json()) as Array<{ id: string }>;
  expect(orgs.length).toBeGreaterThan(0);
  return orgs[0].id;
}

test.describe('guardian impersonation (`?as=`) — Phase-A.2', () => {
  let apiReq: APIRequestContext;
  let boundToken: string;
  let unboundToken: string;
  let childUserId: string;
  let orgId: string;

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
    const bound = await login(apiReq, 'parent-bound@demo.psynote.cn');
    const unbound = await login(apiReq, 'parent-unbound@demo.psynote.cn');
    const child = await login(apiReq, 'client@demo.psynote.cn');
    boundToken = bound.accessToken;
    unboundToken = unbound.accessToken;
    childUserId = child.user.id;
    orgId = await firstOrgId(apiReq, boundToken);
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  test('bound parent CAN view child appointments', async () => {
    const res = await apiReq.get(
      `/api/orgs/${orgId}/client/appointments?as=${childUserId}`,
      { headers: { Authorization: `Bearer ${boundToken}` } },
    );
    expect(res.status()).toBe(200);
  });

  test('unbound parent CANNOT act-as a child (403)', async () => {
    const res = await apiReq.get(
      `/api/orgs/${orgId}/client/appointments?as=${childUserId}`,
      { headers: { Authorization: `Bearer ${unboundToken}` } },
    );
    expect(res.status()).toBe(403);
  });

  test('bound parent CANNOT see child assessment results (reject-as-param whitelist)', async () => {
    const res = await apiReq.get(
      `/api/orgs/${orgId}/client/results?as=${childUserId}`,
      { headers: { Authorization: `Bearer ${boundToken}` } },
    );
    expect(res.status()).toBe(403);
  });
});
