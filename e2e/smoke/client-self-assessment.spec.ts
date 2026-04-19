import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-B.3b · Client self-assessment happy path.
 *
 * The minimum end-to-end contract we want held for launch:
 *   1. A client (seeded in the counseling org) can log in
 *   2. They can POST /api/orgs/:orgId/results with the fixture assessment's
 *      id + per-item answers
 *   3. The server returns 201 with the scoring pipeline's output —
 *      specifically `totalScore` and a non-empty `dimensionScores` array.
 *
 * Why we skip the "list pending" side:
 *   GET /api/orgs/:orgId/client/my-assessments derives pending items from
 *   course/group instance `assessmentConfig` rather than from a
 *   `distributions` row. Wiring a course/group instance just to make the
 *   assessment appear in the list would balloon the seed surface. The
 *   scoring + persistence layer is the actually-valuable contract here,
 *   so we test submission directly and leave the UI-listing path to a
 *   future dedicated smoke.
 *
 * UUIDs below are deterministic demoUUID('...') outputs — keep them in
 * sync with `server/src/seed-e2e.ts` section 6 (B.3b mini fixture).
 */

const API_BASE = 'http://localhost:4000';

// Mirrors server/src/seed-e2e.ts demoUUID('...') outputs. If you change
// those seed keys you must also update these.
const ASSESSMENT_ID = '04358869-d29a-04e8-3b5b-4ebaa681f912'; // demoUUID('e2e-assessment-mini')
const ITEM_0_ID = 'b8d135cf-ee32-474d-365b-b495ba6d8164';      // demoUUID('e2e-item-0')
const ITEM_1_ID = 'deb59b96-bd1f-0e7e-a1d8-25bd8eb84af4';      // demoUUID('e2e-item-1')

test.describe('client self-assessment happy path — Phase-B.3b', () => {
  let apiReq: APIRequestContext;
  let clientToken: string;
  let clientUserId: string;
  let orgId: string;

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
    const loginRes = await apiReq.post('/api/auth/login', {
      data: { email: 'client@demo.psynote.cn', password: 'admin123' },
    });
    expect(loginRes.ok(), `login failed: ${await loginRes.text().catch(() => '')}`).toBeTruthy();
    const login = await loginRes.json();
    clientToken = login.accessToken;
    clientUserId = login.user.id;

    const orgsRes = await apiReq.get('/api/orgs', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(orgsRes.ok()).toBeTruthy();
    const orgs = (await orgsRes.json()) as Array<{ id: string; slug: string }>;
    const demo = orgs.find((o) => o.slug === 'demo') ?? orgs[0];
    orgId = demo.id;
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  test('client submits answers → server computes scores and persists the result', async () => {
    const res = await apiReq.post(`/api/orgs/${orgId}/results`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        assessmentId: ASSESSMENT_ID,
        // userId omitted — defaults to the authenticated client on the server
        answers: {
          [ITEM_0_ID]: 1, // "是"
          [ITEM_1_ID]: 0, // "否"
        },
      },
    });
    expect(res.status(), `submit → ${await res.text().catch(() => '')}`).toBe(201);

    const result = await res.json();
    expect(result.id).toBeTruthy();
    expect(result.assessmentId).toBe(ASSESSMENT_ID);
    expect(result.userId).toBe(clientUserId);
    // totalScore is computed by the service from answers×item.options — with
    // our mini fixture (1 + 0) it must be exactly 1.
    expect(Number(result.totalScore)).toBe(1);
    // dimensionScores is stored as Record<dimensionId, score>. The mini
    // scale has one dimension; so exactly one entry with value 1.
    expect(typeof result.dimensionScores).toBe('object');
    const scores = Object.values(result.dimensionScores as Record<string, number>);
    expect(scores.length).toBe(1);
    expect(scores[0]).toBe(1);
  });
});
