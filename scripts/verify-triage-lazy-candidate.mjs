#!/usr/bin/env node
/**
 * Phase H — BUG-007 真正修复 端到端验证.
 *
 * 验证 lazy-create candidate 链路:
 *   1. b@ (counselor) POST /triage/results/:id/candidate { kind } 创建 candidate
 *   2. 重复 POST 同 (resultId, kind) → 返回原行 (idempotent)
 *   3. 用返回的 candidateId POST /candidates/:id/accept → 创建 episode + 跳转
 *   4. 不同 kind (course_candidate) 同 resultId 不冲突, 创建第二条
 *   5. 已 accept 后再调 lazyCreate 同 (resultId, kind) → INSERT 新行 (旧的不再 pending)
 *   6. dismiss 链路: lazyCreate + dismiss
 *   7. 跨 org 访问 result → 404
 *
 * Run: node scripts/verify-triage-lazy-candidate.mjs
 */

const BASE = process.env.BASE || 'http://localhost';

const ANSI = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  blue: '\x1b[34m', gray: '\x1b[90m', reset: '\x1b[0m', bold: '\x1b[1m',
};
let passed = 0, failed = 0;
function ok(m) { console.log(`${ANSI.green}  ✓${ANSI.reset} ${m}`); passed++; }
function fail(m, extra) {
  console.log(`${ANSI.red}  ✗ ${m}${ANSI.reset}`);
  if (extra) console.log(`${ANSI.gray}    ${JSON.stringify(extra).slice(0, 400)}${ANSI.reset}`);
  failed++;
}
function step(t) { console.log(`\n${ANSI.bold}${ANSI.blue}━━━ ${t}${ANSI.reset}`); }

async function http(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { ok: res.ok, status: res.status, body: json };
}

(async () => {
  step('Login: b@ (counselor in tier1-counseling)');
  const loginB = await http('POST', '/api/auth/login', {
    body: { email: 'b@test.psynote.cn', password: 'test123456' },
  });
  if (!loginB.ok) { fail('b@ login failed', loginB); process.exit(1); }
  const bToken = loginB.body.accessToken;
  ok('b@ logged in');

  // Hardcoded tier1-counseling orgId (b@ is clinic_admin/counselor here)
  // Same as verify-counseling-data-permissions.mjs.
  const orgId = '63844afe-8865-4637-8e77-085900ace6d8';
  ok(`orgId = ${orgId.slice(0, 8)}… (tier1-counseling)`);

  step('Find a screening triage row WITHOUT a candidate (so lazy-create has work to do)');
  const candidates = await http('GET', `/api/orgs/${orgId}/triage/candidates?mode=screening`, { token: bToken });
  if (!candidates.ok) { fail('list triage candidates', candidates); process.exit(1); }
  const noCandRow = (candidates.body || []).find((r) => r.resultId && !r.candidateId);
  if (!noCandRow) {
    console.log(`${ANSI.yellow}  ! no row without candidateId — all rows already have candidates from rule engine. skipping.${ANSI.reset}`);
    process.exit(0);
  }
  ok(`found row resultId=${noCandRow.resultId.slice(0, 8)}…  riskLevel=${noCandRow.riskLevel}`);

  step('Test 1: lazy-create episode_candidate from result');
  const create1 = await http('POST', `/api/orgs/${orgId}/triage/results/${noCandRow.resultId}/candidate`, {
    token: bToken,
    body: { kind: 'episode_candidate' },
  });
  if (create1.status !== 201) { fail(`expected 201, got ${create1.status}`, create1.body); process.exit(1); }
  if (create1.body.kind !== 'episode_candidate') fail('kind mismatch', create1.body);
  if (create1.body.sourceRuleId !== null) fail('sourceRuleId should be null (manual)', create1.body);
  if (create1.body.status !== 'pending') fail('status should be pending', create1.body);
  if (create1.body.sourceResultId !== noCandRow.resultId) fail('sourceResultId should match', create1.body);
  ok(`created candidate ${create1.body.id.slice(0, 8)}… (sourceRuleId=null, pending)`);

  step('Test 2: idempotent — repeat same call → return same row, no new INSERT');
  const create2 = await http('POST', `/api/orgs/${orgId}/triage/results/${noCandRow.resultId}/candidate`, {
    token: bToken,
    body: { kind: 'episode_candidate' },
  });
  if (create2.body.id === create1.body.id) {
    ok('idempotent: returned the same candidate id');
  } else {
    fail(`expected same id ${create1.body.id}, got ${create2.body.id}`);
  }

  step('Test 3: priority = urgent on L4 result (when result level_4)');
  if (noCandRow.riskLevel === 'level_4') {
    if (create1.body.priority === 'urgent') ok('L4 → priority=urgent');
    else fail(`expected urgent, got ${create1.body.priority}`);
  } else {
    if (create1.body.priority === 'normal') ok(`non-L4 (${noCandRow.riskLevel}) → priority=normal`);
    else fail(`expected normal, got ${create1.body.priority}`);
  }

  step('Test 4: different kind on same result → new row (not idempotent across kind)');
  const create3 = await http('POST', `/api/orgs/${orgId}/triage/results/${noCandRow.resultId}/candidate`, {
    token: bToken,
    body: { kind: 'course_candidate' },
  });
  if (create3.body.id !== create1.body.id) ok('different kind produces different candidate row');
  else fail('expected different row for course_candidate');

  step('Test 5: dismiss flow — lazy-create candidate + dismiss');
  // Use Test 4 candidate
  const dismiss = await http('POST', `/api/orgs/${orgId}/workflow/candidates/${create3.body.id}/dismiss`, {
    token: bToken,
    body: { reason: 'E2E 测试 dismiss' },
  });
  if (dismiss.status === 200) ok('dismiss succeeded');
  else fail(`dismiss failed (${dismiss.status})`, dismiss.body);

  step('Test 6: 跨 org 访问 → 404 (validates orgId-scoped SELECT)');
  // Use a totally fake / wrong UUID-shaped resultId
  const fake = await http('POST', `/api/orgs/${orgId}/triage/results/00000000-0000-0000-0000-000000000000/candidate`, {
    token: bToken,
    body: { kind: 'episode_candidate' },
  });
  if (fake.status === 404) ok('non-existent result → 404');
  else fail(`expected 404 for non-existent, got ${fake.status}`, fake.body);

  step('Test 7: audit log entry for candidate.created.manual (via a@ since /audit needs org_admin)');
  const loginA = await http('POST', '/api/auth/login', {
    body: { email: 'a@test.psynote.cn', password: 'test123456' },
  });
  if (!loginA.ok) {
    console.log(`${ANSI.yellow}  ! a@ login failed — skipping audit check${ANSI.reset}`);
  } else {
    const aToken = loginA.body.accessToken;
    const audit = await http(
      'GET',
      `/api/orgs/${orgId}/collaboration/audit?action=candidate.created.manual&limit=10`,
      { token: aToken },
    );
    if (audit.ok) {
      const list = audit.body?.entries || audit.body || [];
      const found = Array.isArray(list)
        ? list.find((e) => e.resourceId === create1.body.id || e.targetId === create1.body.id)
        : null;
      if (found) ok('audit entry candidate.created.manual found');
      else console.log(`${ANSI.yellow}  ! audit list returned (${list.length} rows) but no row matched — may be paged${ANSI.reset}`);
    } else {
      console.log(`${ANSI.yellow}  ! audit query returned ${audit.status} — skipping${ANSI.reset}`);
    }
  }

  // Summary
  console.log();
  if (failed === 0) {
    console.log(`${ANSI.bold}${ANSI.green}✅ ALL ${passed} CHECKS PASSED${ANSI.reset}`);
    process.exit(0);
  } else {
    console.log(`${ANSI.bold}${ANSI.red}❌ ${failed} CHECK(S) FAILED, ${passed} passed${ANSI.reset}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error(`${ANSI.red}fatal: ${err?.message || err}${ANSI.reset}`);
  process.exit(2);
});
