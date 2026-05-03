import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * referral.service.getByDownloadToken — W2.9 single-use enforcement.
 *
 * Why: 之前 downloadToken 仅做"过期 / 状态"校验, 未消费. 一份外部转介
 * 的下载链接被中转 / 转发 / 邮箱缓存任何一种, 攻击者拿到 URL 就能在 7
 * 天内反复下载 PHI 数据包.
 *
 * 修法: 校验通过后, 在 resolveDataPackage 之前 nullify downloadToken.
 * 后续请求同一 token 会因找不到行返回 404.
 */

const dbResults: unknown[][] = [];
const dbUpdates: Array<{ table: string; values: unknown }> = [];
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

const { getByDownloadToken } = await import('./referral.service.js');

describe('getByDownloadToken — W2.9 single-use', () => {
  beforeEach(() => {
    dbResults.length = 0;
    dbUpdates.length = 0;
  });

  it('valid token: 在返回数据前 nullify downloadToken (single-use)', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    dbResults.push([{
      id: 'ref-1',
      downloadToken: 'tok-abc',
      downloadExpiresAt: future,
      status: 'consented',
    }]);
    // resolveDataPackage 会做后续 select; 不补 dbResults 让它落到空数组
    // (它可能 throw 也可能不 throw, 都不影响我们的核心断言: update 已被调用)

    try {
      await getByDownloadToken('tok-abc');
    } catch {
      // resolveDataPackage 在 mock 下可能抛, 不关心
    }

    const tokenNullify = dbUpdates.find(
      (u) => u.table === 'referrals' && (u.values as any).downloadToken === null,
    );
    expect(tokenNullify).toBeDefined();
  });

  it('已 nullify 的 token (subsequent request) → NotFoundError', async () => {
    dbResults.push([]); // 无匹配行
    await expect(getByDownloadToken('tok-already-used')).rejects.toThrow(/not found/i);
    expect(dbUpdates).toHaveLength(0);
  });

  it('过期 token → ValidationError, 不 nullify', async () => {
    const past = new Date(Date.now() - 1000);
    dbResults.push([{
      id: 'ref-1',
      downloadToken: 'tok-expired',
      downloadExpiresAt: past,
      status: 'consented',
    }]);
    await expect(getByDownloadToken('tok-expired')).rejects.toThrow(/expired/i);
    expect(dbUpdates).toHaveLength(0);
  });

  it('状态不在 consented/completed → ValidationError, 不 nullify', async () => {
    const future = new Date(Date.now() + 1000 * 60);
    dbResults.push([{
      id: 'ref-1',
      downloadToken: 'tok-pending',
      downloadExpiresAt: future,
      status: 'pending',
    }]);
    await expect(getByDownloadToken('tok-pending')).rejects.toThrow();
    expect(dbUpdates).toHaveLength(0);
  });
});
