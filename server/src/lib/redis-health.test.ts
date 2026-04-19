import { describe, it, expect } from 'vitest';
import { isRedisReachable } from './redis-health.js';

/**
 * The probe's critical property is: when Redis is unreachable, it
 * MUST return false within ~timeoutMs and MUST NOT throw. If it throws
 * or hangs, the server-boot code path loses its safety net and the
 * BullMQ reconnect loop kicks in.
 *
 * We hit an IP:port that has nothing listening (TEST-NET-1 + closed
 * port). Node won't find a route / SYN will RST, and our probe must
 * resolve to false fast.
 */
describe('isRedisReachable', () => {
  it('returns false (does NOT throw) when the target is unreachable', async () => {
    const start = Date.now();
    // 192.0.2.0/24 is TEST-NET-1, guaranteed unroutable per RFC 5737.
    const reachable = await isRedisReachable('redis://192.0.2.1:6379', 1500);
    const elapsed = Date.now() - start;

    expect(reachable).toBe(false);
    // Must respect the tight timeout — otherwise boot waits too long.
    expect(elapsed).toBeLessThan(2500);
  });

  it('returns false when the port is closed on localhost', async () => {
    // Port 1 is reserved and will refuse / be filtered. Fast fail expected.
    const reachable = await isRedisReachable('redis://127.0.0.1:1', 1500);
    expect(reachable).toBe(false);
  });
});
