import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

/**
 * Counseling Public Routes —— 咨询中心来访者自助注册
 *
 * POST /api/public/counseling/:orgSlug/register
 *   1. 按 orgSlug 查 organizations;非 counseling 类 → 404
 *   2. 邮箱已在平台有 user → 必须 bcrypt.compare 验密码 (W0.4 安全审计修复)
 *      - 有 passwordHash + 密码对 → 加入 org / 已是成员则 already_registered
 *      - 有 passwordHash + 密码错 → 401 (防接管)
 *      - 无 passwordHash → 视作 claim,设新密码后加入
 *   3. 邮箱是新的 → 建 user + org_members + clientProfile
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

// Mock bcrypt so password verification is deterministic.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (s: string) => `hashed:${s}`),
    compare: vi.fn(),
  },
}));

// 跳过 license 验证,让 counseling 默认 free plan 通过
vi.mock('../../lib/license/verify.js', () => ({
  verifyLicense: vi.fn(async () => ({ valid: false, payload: null })),
}));

const { counselingPublicRoutes } = await import('./counseling-public.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(counselingPublicRoutes);
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

function counselingOrg() {
  return {
    id: 'org-1',
    plan: 'free',
    licenseKey: null,
    settings: { orgType: 'counseling' },
  };
}

// ─── /:orgSlug/register ─────────────────────────────────────────

describe('POST /:orgSlug/register', () => {
  it('orgSlug 不存在 → 404', async () => {
    const app = await buildApp();
    dbResults.push([]); // select org → 空

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'c@x.com', password: 'secret123', name: '张三' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('org 存在但 orgType 不是 counseling → 404(不越权给 school/enterprise)', async () => {
    const app = await buildApp();
    dbResults.push([{ ...counselingOrg(), settings: { orgType: 'school' } }]);

    const res = await app.inject({
      method: 'POST',
      url: '/school1/register',
      payload: { email: 'c@x.com', password: 'secret123', name: '张三' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('新邮箱 → 建 user + org_members(client) + clientProfile', async () => {
    const app = await buildApp();
    dbResults.push([counselingOrg()]);   // select org
    dbResults.push([]);                   // select user by email → 不存在
    dbResults.push([{ id: 'user-1' }]);   // insert user returning
    dbResults.push([]);                   // select existing member → 不存在

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'new@x.com', password: 'secret123', name: '张三', phone: '13800138000' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('registered');
    expect(body.orgId).toBe('org-1');
    expect(body.isNewUser).toBe(true);
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.refreshToken).toBeTypeOf('string');
    // bcrypt.compare 不应被调用 (新用户)
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
  });

  // ─── W0.4 安全修复：已存在用户必须验密码 ────────────────────────

  it('已存在用户(有 passwordHash) + 密码正确 + 未加入该 org → 201 + 加入', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    const app = await buildApp();
    dbResults.push([counselingOrg()]);
    dbResults.push([{ id: 'user-existing', email: 'e@x.com', isSystemAdmin: false, passwordHash: 'real-hash' }]);
    dbResults.push([]); // 不是本 org 成员

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'e@x.com', password: 'secret123', name: '张三' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('registered');
    expect(body.isNewUser).toBe(false);
    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('secret123', 'real-hash');
  });

  it('已存在用户(有 passwordHash) + 密码错误 → 401, 不发 token (防接管)', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false);
    const app = await buildApp();
    dbResults.push([counselingOrg()]);
    dbResults.push([{ id: 'user-existing', email: 'e@x.com', isSystemAdmin: false, passwordHash: 'real-hash' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'e@x.com', password: 'wrong-password', name: '张三' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    // 不应包含 token
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    // 不应触发 org_members / clientProfile insert
    expect(dbInserts.find((i) => i.table === 'org_members')).toBeUndefined();
    expect(dbInserts.find((i) => i.table === 'client_profiles')).toBeUndefined();
  });

  it('已存在用户(无 passwordHash) → claim flow: 设密码 + 加入 org', async () => {
    const app = await buildApp();
    dbResults.push([counselingOrg()]);
    dbResults.push([{ id: 'user-claim', email: 'c@x.com', isSystemAdmin: false, passwordHash: null }]);
    dbResults.push([]); // 不是本 org 成员

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'c@x.com', password: 'newsecret', name: '张三' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('registered');
    // 应触发 hash + update users.passwordHash
    expect(vi.mocked(bcrypt.hash)).toHaveBeenCalledWith('newsecret', 10);
    expect(dbUpdates.find((u) => u.table === 'users')).toBeDefined();
    // bcrypt.compare 不应被调用 (无 passwordHash → 走 claim 不走验证)
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
  });

  it('已存在用户 + 已是该 org 成员 + 密码正确 → 200 already_registered + tokens', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    const app = await buildApp();
    dbResults.push([counselingOrg()]);
    dbResults.push([{ id: 'user-1', email: 'e@x.com', isSystemAdmin: false, passwordHash: 'real-hash' }]);
    dbResults.push([{ id: 'member-1' }]); // 已是成员

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'e@x.com', password: 'secret123', name: '张三' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('already_registered');
    expect(res.json().accessToken).toBeTypeOf('string');
  });

  it('已存在用户 + 已是该 org 成员 + 密码错误 → 401 (防接管现有成员账户)', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false);
    const app = await buildApp();
    dbResults.push([counselingOrg()]);
    dbResults.push([{ id: 'user-1', email: 'e@x.com', isSystemAdmin: false, passwordHash: 'real-hash' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'e@x.com', password: 'wrong-password', name: '张三' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().accessToken).toBeUndefined();
  });

  it('缺字段 → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'c@x.com' }, // 缺 password, name
    });
    expect(res.statusCode).toBe(400);
  });

  it('密码 < 6 位 → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sunshine/register',
      payload: { email: 'c@x.com', password: '12345', name: '张三' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── /:orgSlug/info ─────────────────────────────────────────────

describe('GET /:orgSlug/info', () => {
  it('orgSlug 不存在 → 404', async () => {
    const app = await buildApp();
    dbResults.push([]);
    const res = await app.inject({ method: 'GET', url: '/sunshine/info' });
    expect(res.statusCode).toBe(404);
  });

  it('orgSlug 是 school 类 → 404(仅暴露 counseling)', async () => {
    const app = await buildApp();
    dbResults.push([{ ...counselingOrg(), settings: { orgType: 'school' } }]);
    const res = await app.inject({ method: 'GET', url: '/school1/info' });
    expect(res.statusCode).toBe(404);
  });

  it('合法 counseling org → 返回基本信息(name/logo/themeColor)', async () => {
    const app = await buildApp();
    dbResults.push([{
      ...counselingOrg(),
      name: '阳光心理咨询中心',
      slug: 'sunshine',
      settings: {
        orgType: 'counseling',
        branding: { logoUrl: '/logo.png', themeColor: '#0f766e' },
      },
    }]);
    const res = await app.inject({ method: 'GET', url: '/sunshine/info' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('阳光心理咨询中心');
    expect(body.slug).toBe('sunshine');
    expect(body.logoUrl).toBe('/logo.png');
    expect(body.themeColor).toBe('#0f766e');
  });
});
