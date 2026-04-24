import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Password reset routes — 防枚举 + 一次性 + 15min 过期 + DB 只存 hash
 *
 * 流程:
 *   POST /forgot-password { email }
 *     → 无论邮箱是否存在都返回 200(防枚举)
 *     → 存在则建 token,发邮件,DB 只存 sha256(token)
 *
 *   POST /reset-password { token, newPassword }
 *     → 查 sha256(token) 在 DB 且未 used 且未过期 → 改密码 + 标 used
 *     → 否则 400/410
 */

// ─── DB mock — FIFO queue drains on each terminal chain call ───

const dbResults: unknown[][] = [];
const dbInserts: unknown[] = [];
const dbUpdates: Array<{ table: string; values: unknown; where: unknown }> = [];

let lastUpdate: { values: unknown; where: unknown } | null = null;

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
  chain.where = vi.fn(() => {
    // If an update is pending, this .where finalizes it
    if (lastUpdate) {
      const u = lastUpdate;
      lastUpdate = null;
      dbUpdates.push({ table: 'unknown', values: u.values, where: 'captured' });
      return Promise.resolve();
    }
    return terminal(dbResults.shift() ?? []);
  });
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn((v) => {
    dbInserts.push(v);
    return terminal(dbResults.shift() ?? []);
  });
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn((v) => {
    lastUpdate = { values: v, where: null };
    return chain;
  });
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

// ─── Mailer mock — capture sent reset links ───
const sentEmails: Array<{ to: string; subject: string; resetLink: string }> = [];
vi.mock('../../lib/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn(async (to: string, resetLink: string) => {
    sentEmails.push({ to, subject: 'password-reset', resetLink });
  }),
  assertMailerReady: vi.fn(),
}));

// Import AFTER mocks installed.
const { passwordResetRoutes } = await import('./password-reset.routes.js');
const { errorHandler } = await import('../../middleware/error-handler.js');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(passwordResetRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  dbResults.length = 0;
  dbInserts.length = 0;
  dbUpdates.length = 0;
  sentEmails.length = 0;
  lastUpdate = null;
});

// ─── /forgot-password ──────────────────────────────────────────

describe('POST /forgot-password', () => {
  it('未知邮箱 → 返回 200, 不发邮件 (防枚举)', async () => {
    const app = await buildApp();
    // DB 查 user → 空
    dbResults.push([]);

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'nobody@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(sentEmails).toHaveLength(0);
  });

  it('已知邮箱 → 200 + DB 存 token hash + 发邮件带链接', async () => {
    const app = await buildApp();
    // DB 查 user → 找到
    const userId = 'user-1';
    dbResults.push([{ id: userId, email: 'found@example.com', name: '测试' }]);
    // DB 插 token → 返回插入的行
    dbResults.push([{ id: 'tok-1', userId, tokenHash: 'any-hash', expiresAt: new Date() }]);

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'found@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('found@example.com');
    // 链接里要带明文 token (只在邮件里出现,DB 里只存 hash)
    expect(sentEmails[0].resetLink).toMatch(/token=[a-f0-9]{64}/);
    // DB 插的应该是 hash 不是明文
    const inserted = dbInserts[0] as { tokenHash: string; userId: string };
    expect(inserted.userId).toBe(userId);
    expect(inserted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('缺少 email → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── /reset-password ──────────────────────────────────────────

describe('POST /reset-password', () => {
  function mockValidToken(opts: {
    userId?: string;
    expiresAt?: Date;
    usedAt?: Date | null;
  } = {}) {
    const now = new Date();
    dbResults.push([
      {
        id: 'tok-1',
        userId: opts.userId ?? 'user-1',
        tokenHash: 'hash-of-valid-token',
        expiresAt: opts.expiresAt ?? new Date(now.getTime() + 10 * 60_000),
        usedAt: opts.usedAt ?? null,
      },
    ]);
  }

  it('合法 token + 新密码 >= 6 位 → 成功改密码 + 标 used', async () => {
    const app = await buildApp();
    const token = 'a'.repeat(64); // 64 hex chars
    mockValidToken();
    // update password 的 .where 触发时不需要返回行(我们的 mock 不依赖)
    // update token used_at

    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: { token, newPassword: 'NewSecure@2026' },
    });

    expect(res.statusCode).toBe(200);
    // 应该有两次 update: 一次改 users.passwordHash, 一次标 tokens.usedAt
    expect(dbUpdates.length).toBeGreaterThanOrEqual(2);
  });

  it('token 不存在 → 400', async () => {
    const app = await buildApp();
    dbResults.push([]); // query 返回空

    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: { token: 'b'.repeat(64), newPassword: 'NewSecure@2026' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('token 已 used → 400', async () => {
    const app = await buildApp();
    mockValidToken({ usedAt: new Date(Date.now() - 60_000) });

    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: { token: 'c'.repeat(64), newPassword: 'NewSecure@2026' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('token 已过期 → 400', async () => {
    const app = await buildApp();
    mockValidToken({ expiresAt: new Date(Date.now() - 60_000) });

    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: { token: 'd'.repeat(64), newPassword: 'NewSecure@2026' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('新密码 < 6 位 → 400', async () => {
    const app = await buildApp();
    // 这种请求在到 DB 前就应该挂,但 mock 以防万一
    dbResults.push([]);

    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: { token: 'e'.repeat(64), newPassword: '123' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('缺少 token 或 newPassword → 400', async () => {
    const app = await buildApp();
    const res1 = await app.inject({
      method: 'POST', url: '/reset-password',
      payload: { newPassword: 'NewSecure@2026' },
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'POST', url: '/reset-password',
      payload: { token: 'f'.repeat(64) },
    });
    expect(res2.statusCode).toBe(400);
  });
});

// ─── Token 生成与 hash 的实用性验证 ─────────────────────────

describe('crypto invariants', () => {
  it('sha256(token) 可以从明文 token 一致地重算', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashA = crypto.createHash('sha256').update(token).digest('hex');
    const hashB = crypto.createHash('sha256').update(token).digest('hex');
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });
});
