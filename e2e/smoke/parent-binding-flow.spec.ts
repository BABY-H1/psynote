import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Phase-B.3d · Parent invite-token binding happy path + anti-impersonation.
 *
 * Exercises the full /api/public/parent-bind/:token flow against seeded
 * school-org fixtures (one class, one student张三, one active invite token).
 *
 *   1. GET /:token → preview returns school + class info
 *   2. POST /:token with correct 3-field identity → 201 + JWT bundle
 *   3. POST /:token with WRONG student name → 400 (anti-impersonation)
 *
 * The 3 student-identifying fields (studentId + studentName + phoneLast4)
 * are the load-bearing security property. Regression here lets a stranger
 * bind to anyone else's kid just by knowing the class invite link.
 *
 * Note: each run of test #2 creates a new guardian user (no way to delete
 * via public API). Acceptable for a smoke suite re-run against a dev DB;
 * for CI we'd want a teardown path — out of scope here.
 */

const API_BASE = 'http://localhost:4000';

// Pinned in server/src/seed-e2e.ts — DO NOT change without updating seed.
const INVITE_TOKEN = 'e2e-school-invite-token-fixed-2026';
const STUDENT_NAME = '张三';
const STUDENT_NUMBER = 'S2026001';
const PARENT_PHONE_LAST4 = '9988';

test.describe('parent invite-token binding — Phase-B.3d', () => {
  let apiReq: APIRequestContext;

  test.beforeAll(async () => {
    apiReq = await request.newContext({ baseURL: API_BASE });
  });

  test.afterAll(async () => {
    await apiReq.dispose();
  });

  test('GET /preview returns school + class info for a valid token', async () => {
    const res = await apiReq.get(`/api/public/parent-bind/${INVITE_TOKEN}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.className).toBe('一班');
    expect(body.classGrade).toBe('七年级');
    expect(body.orgName).toBeTruthy();
  });

  test('POST /:token with correct 3-field identity mints a guardian JWT (happy path)', async () => {
    // Use a unique password each run so even if the same DB sticks around
    // across test re-runs, we're not hammering one bcrypt comparison.
    const res = await apiReq.post(`/api/public/parent-bind/${INVITE_TOKEN}`, {
      data: {
        studentName: STUDENT_NAME,
        studentNumber: STUDENT_NUMBER,
        phoneLast4: PARENT_PHONE_LAST4,
        relation: 'father',
        myName: '张爸爸',
        password: `e2e-${Date.now()}`,
      },
    });
    expect(res.status(), `bind → ${await res.text().catch(() => '')}`).toBe(201);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    // Shape parity with /api/auth/login — guardian must be able to reuse
    // the token immediately against portal APIs.
    expect(body.user?.id).toBeTruthy();
  });

  test('POST /:token with WRONG student name returns 400 (anti-impersonation)', async () => {
    const res = await apiReq.post(`/api/public/parent-bind/${INVITE_TOKEN}`, {
      data: {
        studentName: '王五-wrong-name', // intentional mismatch
        studentNumber: STUDENT_NUMBER,
        phoneLast4: PARENT_PHONE_LAST4,
        relation: 'father',
        myName: '张爸爸',
        password: 'admin123',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/信息核对失败/);
  });
});
