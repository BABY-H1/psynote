import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Public Course Enroll —— 公开课程报名 (no auth)
 *
 * POST /api/public/courses/:instanceId/apply
 *
 * W0.4 安全修复 (2026-05-03 audit): 之前版本在创建新 user 时写
 *   passwordHash: randomUUID()
 * — 这是个 fake hash (UUID 不是 bcrypt 格式), 导致:
 *   1. email 被永久占用,真实主人无法用相同邮箱去 counseling-public 注册
 *   2. 即使有人尝试用 UUID 当密码登录也失败,但账户已被"squatted"
 *
 * 修法: passwordHash: null。auth.routes.ts 已正确处理 null passwordHash
 * (fail-closed登录),并配合 W0.4 counseling-public.routes 的 claim flow,
 * 真实主人可以用相同邮箱来 counseling-public 完成注册并设密码。
 */

const dbResults: unknown[][] = [];
const dbInserts: Array<{ table: string; values: unknown }> = [];
let _currentInsertTable = '';

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
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

const { publicCourseEnrollRoutes } = await import('./public-course-enroll.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicCourseEnrollRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  dbResults.length = 0;
  dbInserts.length = 0;
});

function activePublicInstance() {
  return {
    id: 'inst-1',
    courseId: 'course-1',
    title: '正念课',
    description: 'desc',
    capacity: 30,
    status: 'active',
    publishMode: 'public',
  };
}

describe('POST /:instanceId/apply', () => {
  it('新邮箱 → 创建 user 时 passwordHash 必须为 null,不得是 fake UUID', async () => {
    const app = await buildApp();
    dbResults.push([activePublicInstance()]); // instance lookup
    dbResults.push([]);                         // user 不存在
    dbResults.push([{ id: 'user-new', email: 'new@x.com', name: '王五' }]); // insert user returning
    dbResults.push([]);                         // not enrolled
    dbResults.push([{ id: 'enr-1' }]);          // insert enrollment returning

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/apply',
      payload: { name: '王五', email: 'new@x.com' },
    });
    expect(res.statusCode).toBe(201);

    const userInsert = dbInserts.find((i) => i.table === 'users');
    expect(userInsert).toBeDefined();
    const values = userInsert!.values as Record<string, unknown>;
    // passwordHash 必须是 null。Regression guard: 历史 bug 写的是
    // randomUUID() (UUID v4 格式),不能再回去。
    expect(values.passwordHash).toBeNull();
    if (typeof values.passwordHash === 'string') {
      expect(values.passwordHash).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it('已存在用户 → 直接复用,不再 insert users (no email squat)', async () => {
    const app = await buildApp();
    dbResults.push([activePublicInstance()]);
    dbResults.push([{ id: 'user-existing', email: 'e@x.com', name: '老用户', passwordHash: 'real-hash' }]);
    dbResults.push([]);                          // not enrolled
    dbResults.push([{ id: 'enr-2' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/apply',
      payload: { name: '老用户', email: 'e@x.com' },
    });
    expect(res.statusCode).toBe(201);
    // 不应触发 users insert
    expect(dbInserts.find((i) => i.table === 'users')).toBeUndefined();
  });

  it('实例不存在 → 404', async () => {
    const app = await buildApp();
    dbResults.push([]);
    const res = await app.inject({
      method: 'POST',
      url: '/missing/apply',
      payload: { name: '王五', email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('实例 status != active → 400', async () => {
    const app = await buildApp();
    dbResults.push([{ ...activePublicInstance(), status: 'closed' }]);
    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/apply',
      payload: { name: '王五', email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('publishMode != public → 403', async () => {
    const app = await buildApp();
    dbResults.push([{ ...activePublicInstance(), publishMode: 'assign' }]);
    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/apply',
      payload: { name: '王五', email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('缺 name 或 email → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/apply',
      payload: { email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});
