#!/usr/bin/env node
/**
 * Verify BUG-003 fix: license renew now uses max(now, oldExpiry) + months
 * (not now + months). Sysadmin renews an existing license whose expiry is
 * far in the future, expects the new expiry to be > oldExpiry + 11 months.
 *
 * Run: node scripts/verify-renew-semantic.mjs
 */
const BASE = process.env.BASE || 'http://localhost';

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
  // Login as system admin
  const login = await http('POST', '/api/auth/login', {
    body: { email: 'a@test.psynote.cn', password: 'test123456' },
  });
  if (!login.ok) { console.error('login failed', login); process.exit(1); }
  const token = login.body.accessToken;

  // tier1-counseling org
  const orgId = '63844afe-8865-4637-8e77-085900ace6d8';

  // Get current license
  const before = await http('GET', `/api/admin/tenants/${orgId}`, { token });
  if (!before.ok) { console.error('get tenant failed', before); process.exit(1); }
  const oldExpiry = new Date(before.body.license.expiresAt);
  console.log(`Before renew: license.expiresAt = ${oldExpiry.toISOString()}`);

  // Renew 12 months
  const renew = await http('POST', `/api/admin/licenses/renew`, { token, body: { orgId, months: 12 } });
  if (!renew.ok) { console.error('renew failed', renew); process.exit(1); }
  const newExpiry = new Date(renew.body.expiresAt);
  console.log(`After renew:  license.expiresAt = ${newExpiry.toISOString()}`);

  // Compare
  const monthsDiff = (newExpiry.getTime() - oldExpiry.getTime()) / (1000 * 60 * 60 * 24 * 30);
  console.log(`Difference:   ${monthsDiff.toFixed(2)} months`);

  if (monthsDiff >= 11.5 && monthsDiff <= 12.5) {
    console.log(`✓ PASS: renew correctly extends from old expiry by 12 months (newExpiry - oldExpiry ≈ 12 months)`);
  } else if (monthsDiff < 1) {
    console.log(`✗ FAIL: BUG-003 still present — new expiry is roughly equal to old (${monthsDiff.toFixed(2)} months apart)`);
    process.exit(1);
  } else {
    console.log(`? Unexpected difference: ${monthsDiff.toFixed(2)} months — review`);
    process.exit(1);
  }
})();
