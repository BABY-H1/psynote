import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Public Group Enroll — POST /:instanceId/checkin/:sessionId
 *
 * W2.8 (security audit 2026-05-03): 之前 self check-in 接受 body 里
 * 任意 enrollmentId, 仅校验 (sessionId, instanceId) 关联. 攻击者用别 group
 * 的 enrollmentId 也能在本 group 的 session 下写一条 present 出勤记录 —
 * 任意签到伪造.
 *
 * 修法: 在写 attendance 之前再 query 一次 groupEnrollments, 确认
 * (enrollmentId, instanceId) 关联. 不存在则 404.
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
    return terminal(dbResults.shift() ?? [{ id: 'new-id', status: 'present' }]);
  });
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

const { publicEnrollRoutes } = await import('./public-enroll.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicEnrollRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  dbResults.length = 0;
  dbInserts.length = 0;
});

describe('POST /:instanceId/checkin/:sessionId — W2.8 instance verification', () => {
  it('正常签到: enrollment 属于本 instance → 201, 写出勤', async () => {
    const app = await buildApp();
    dbResults.push([{ id: 'sess-1', instanceId: 'inst-1', date: '2026-05-10', status: 'planned' }]); // session lookup
    dbResults.push([{ id: 'enr-ok' }]);  // W2.8: enrollment 属于本 instance
    dbResults.push([]);                   // not yet checked in
    dbResults.push([{ id: 'att-1', status: 'present' }]); // insert attendance returning

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/checkin/sess-1',
      payload: { enrollmentId: 'enr-ok' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(dbInserts.find((i) => i.table === 'group_session_attendance')).toBeDefined();
  });

  it('enrollment 不属于本 instance (跨组伪造) → 404, 不写出勤 ⭐', async () => {
    const app = await buildApp();
    dbResults.push([{ id: 'sess-1', instanceId: 'inst-1', date: '2026-05-10', status: 'planned' }]);
    dbResults.push([]); // W2.8: enrollment 不属于本 instance → 空

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/checkin/sess-1',
      payload: { enrollmentId: 'enr-from-other-group' },
    });
    expect(res.statusCode).toBe(404);
    // 关键: 不应写 group_session_attendance
    expect(dbInserts.find((i) => i.table === 'group_session_attendance')).toBeUndefined();
  });

  it('已签到 → 200, 不重复 insert', async () => {
    const app = await buildApp();
    dbResults.push([{ id: 'sess-1', instanceId: 'inst-1', date: '2026-05-10', status: 'planned' }]);
    dbResults.push([{ id: 'enr-ok' }]); // enrollment 验证通过
    dbResults.push([{ id: 'att-existing', status: 'present' }]); // 已有 attendance

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/checkin/sess-1',
      payload: { enrollmentId: 'enr-ok' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('已签到');
    expect(dbInserts.find((i) => i.table === 'group_session_attendance')).toBeUndefined();
  });

  it('session 不存在 / 不属于本 instance → 404', async () => {
    const app = await buildApp();
    dbResults.push([]); // session 找不到

    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/checkin/missing-sess',
      payload: { enrollmentId: 'enr-1' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('缺 enrollmentId → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/inst-1/checkin/sess-1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
