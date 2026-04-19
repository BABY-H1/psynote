import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-B.3b · Counselor session-note happy path.
 *
 * The minimum end-to-end contract we care about for launch:
 *   1. counselor logs in
 *   2. opens a care_episode for a client
 *   3. writes a SOAP session note linked to that episode
 *   4. the note is readable back via GET /:noteId
 *
 * Pure API — no browser, no Playwright storageState. We use the
 * counseling demo org fixtures that seed-e2e.ts has always created:
 * counselor = counselor@demo.psynote.cn, client = client@demo.psynote.cn.
 *
 * Login pooled in beforeAll to stay under the rate limiter.
 */

const API_BASE = 'http://localhost:4000';

test.describe('counselor session-note happy path — Phase-B.3b', () => {
  let apiReq: APIRequestContext;
  let counselorToken: string;
  let counselorId: string;
  let clientId: string;
  let orgId: string;

  async function login(email: string) {
    const res = await apiReq.post('/api/auth/login', {
      data: { email, password: 'admin123' },
    });
    expect(res.ok(), `login(${email}) should succeed`).toBeTruthy();
    return res.json();
  }

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
    const counselor = await login('counselor@demo.psynote.cn');
    const client = await login('client@demo.psynote.cn');
    counselorToken = counselor.accessToken;
    counselorId = counselor.user.id;
    clientId = client.user.id;

    // Resolve the counseling org id (we know it's the first — counselor is
    // a member of a single org in the E2E seed).
    const orgsRes = await apiReq.get('/api/orgs', {
      headers: { Authorization: `Bearer ${counselorToken}` },
    });
    expect(orgsRes.ok()).toBeTruthy();
    const orgs = (await orgsRes.json()) as Array<{ id: string; slug: string }>;
    const demo = orgs.find((o) => o.slug === 'demo') ?? orgs[0];
    orgId = demo.id;
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  test('counselor opens episode → writes session note → reads it back', async () => {
    // 1. Open episode
    const epRes = await apiReq.post(`/api/orgs/${orgId}/episodes`, {
      headers: { Authorization: `Bearer ${counselorToken}` },
      data: {
        clientId,
        counselorId,
        chiefComplaint: '近期工作压力 (E2E happy path)',
        currentRisk: 'level_2',
        interventionType: 'individual',
      },
    });
    expect(epRes.status(), `create episode → ${await epRes.text().catch(() => '')}`).toBe(201);
    const episode = await epRes.json();
    expect(episode.id).toBeTruthy();
    expect(episode.clientId).toBe(clientId);

    // 2. Write a session note
    const noteRes = await apiReq.post(`/api/orgs/${orgId}/session-notes`, {
      headers: { Authorization: `Bearer ${counselorToken}` },
      data: {
        careEpisodeId: episode.id,
        clientId,
        sessionDate: new Date().toISOString(),
        sessionType: '个体咨询',
        duration: 50,
        noteFormat: 'soap',
        subjective: '来访者自述工作压力增大 (E2E happy path)',
        objective: '坐姿紧张，语速偏快',
        assessment: '中度职场适应困难',
        plan: '布置情绪日记',
      },
    });
    expect(noteRes.status(), `create note → ${await noteRes.text().catch(() => '')}`).toBe(201);
    const note = await noteRes.json();
    expect(note.id).toBeTruthy();
    expect(note.careEpisodeId).toBe(episode.id);

    // 3. Read the note back by id
    const getRes = await apiReq.get(`/api/orgs/${orgId}/session-notes/${note.id}`, {
      headers: { Authorization: `Bearer ${counselorToken}` },
    });
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(note.id);
    expect(fetched.subjective).toContain('E2E happy path');
  });
});
