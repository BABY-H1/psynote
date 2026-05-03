import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

/**
 * EAP Public Routes —— 企业 EAP 员工自助注册
 *
 * POST /api/public/eap/:orgSlug/register
 *   1. 按 orgSlug 查 organizations + 校验 EAP 资质
 *   2. 邮箱已在平台有 user → 必须 bcrypt.compare 验密码 (W0.4 安全审计修复)
 *      - 有 passwordHash + 密码对 → 加入 org / 已是成员则 already_registered
 *      - 有 passwordHash + 密码错 → 401 (防接管)
 *      - 无 passwordHash → 视作 claim,设新密码后加入
 *   3. 邮箱是新的 → 建 user + org_members(client) + eapEmployeeProfile
 */

const dbResults: unknown[][] = [];
const dbInserts: Array<{ table: string; values: unknown }> = [];
const dbUpdates: Array<{ table: string; values: unknown }> = [];
let _currentInsertTable = '';
let _currentUpdateTable = '';

function terminal(rows: unknown[]): any {
  const p: any = Promise.resolve(rows);
  p.limit = () => Promise.resolve(rows);
  p.returning = () => Promise.resolve(rows);
  return p;
}

vi.mock('../../config/database.js', () => {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => terminal(dbResults.shift() ?? []));
  chain.insert = vi.fn((table: any) => {
    _currentInsertTable = (table?.[Symbol.for('drizzle:Name')] as string) || 'unknown';
    return chain;
  });
  chain.values = vi.fn((v: unknown) => {
    dbInserts.push({ table: _currentInsertTable, values: v });
    return terminal(dbResults.shift() ?? [{ id: 'new-id' }]);
  });
  chain.update = vi.fn((table: any) => {
    _currentUpdateTable = (table?.[Symbol.for('drizzle:Name')] as string) || 'unknown';
    return chain;
  });
  chain.set = vi.fn((v: unknown) => {
    dbUpdates.push({ table: _currentUpdateTable, values: v });
    return chain;
  });
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (s: string) => `hashed:${s}`),
    compare: vi.fn(),
  },
}));

// EAP 资质走 license 校验 — mock 成 enterprise tier 通过
vi.mock('../../lib/license/verify.js', () => ({
  verifyLicense: vi.fn(async () => ({
    valid: true,
    payload: { tier: 'enterprise' },
  })),
}));

// hasFeature mock — let enterprise tier have eap
vi.mock('@psynote/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@psynote/shared');
  return {
    ...actual,
    hasFeature: (tier: string, feature: string) => tier === 'enterprise' && feature === 'eap',
    planToTier: () => 'free',
  };
});

const { eapPublicRoutes } = await import('./eap-public.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(eapPublicRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  dbResults.length = 0;
  dbInserts.length = 0;
  dbUpdates.length = 0;
  vi.mocked(bcrypt.compare).mockReset();
  vi.mocked(bcrypt.hash).mockClear();
});

function eapOrg() {
  return {
    id: 'org-eap-1',
    plan: 'enterprise',
    licenseKey: 'lic-eap',
    settings: { orgType: 'enterprise' },
  };
}

describe('POST /:orgSlug/register (EAP)', () => {
  it('新邮箱 → 建 user + org_members(client) + eapEmployeeProfile', async () => {
    const app = await buildApp();
    dbResults.push([eapOrg()]);
    dbResults.push([]); // user 不存在
    dbResults.push([{ id: 'user-new' }]); // insert user returning
    dbResults.push([]); // 不是成员

    const res = await app.inject({
      method: 'POST',
      url: '/acme/register',
      payload: { email: 'emp@acme.com', password: 'secret123', name: '员工' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('registered');
    expect(body.isNewUser).toBe(true);
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
  });

  // ─── W0.4 安全修复：已存在用户必须验密码 ────────────────────────

  it('已存在用户(有 passwordHash) + 密码正确 + 未加入 → 201', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    const app = await buildApp();
    dbResults.push([eapOrg()]);
    dbResults.push([{ id: 'user-e', email: 'e@a.com', passwordHash: 'real-hash' }]);
    dbResults.push([]); // 不是成员

    const res = await app.inject({
      method: 'POST',
      url: '/acme/register',
      payload: { email: 'e@a.com', password: 'secret123', name: '员工' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().isNewUser).toBe(false);
    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('secret123', 'real-hash');
  });

  it('已存在用户(有 passwordHash) + 密码错误 → 401, 不附加成员关系', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false);
    const app = await buildApp();
    dbResults.push([eapOrg()]);
    dbResults.push([{ id: 'user-e', email: 'e@a.com', passwordHash: 'real-hash' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/acme/register',
      payload: { email: 'e@a.com', password: 'wrongpw', name: '员工' },
    });
    expect(res.statusCode).toBe(401);
    expect(dbInserts.find((i) => i.table === 'org_members')).toBeUndefined();
    expect(dbInserts.find((i) => i.table === 'eap_employee_profiles')).toBeUndefined();
  });

  it('已存在用户(无 passwordHash) → claim flow: 设密码 + 加入', async () => {
    const app = await buildApp();
    dbResults.push([eapOrg()]);
    dbResults.push([{ id: 'user-claim', email: 'c@a.com', passwordHash: null }]);
    dbResults.push([]);

    const res = await app.inject({
      method: 'POST',
      url: '/acme/register',
      payload: { email: 'c@a.com', password: 'newsecret', name: '员工' },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(bcrypt.hash)).toHaveBeenCalledWith('newsecret', 10);
    expect(dbUpdates.find((u) => u.table === 'users')).toBeDefined();
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
  });

  it('已存在用户 + 已是成员 + 密码错误 → 401', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false);
    const app = await buildApp();
    dbResults.push([eapOrg()]);
    dbResults.push([{ id: 'user-e', email: 'e@a.com', passwordHash: 'real-hash' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/acme/register',
      payload: { email: 'e@a.com', password: 'wrongpw', name: '员工' },
    });
    expect(res.statusCode).toBe(401);
  });
});
