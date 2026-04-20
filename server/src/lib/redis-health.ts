import Redis from 'ioredis';

/**
 * One-shot Redis reachability probe.
 *
 * Used at server boot to decide whether to initialize the BullMQ worker
 * (`server/src/server.ts`). Without this probe, BullMQ's own Queue/Worker
 * constructors spray `AggregateError [ECONNREFUSED]` retries onto the
 * event loop indefinitely when Redis is down, which eventually kills
 * the dev server via unhandledRejection.
 *
 * Contract: returns true iff a PING round-trip completes within
 * `timeoutMs`. Never throws — all errors are swallowed and reported as
 * `false`. The caller logs the outcome and decides what to do.
 *
 * The probe uses its own short-lived connection (not ioredis's shared
 * pool) with `lazyConnect: true` + `maxRetriesPerRequest: 0`, so a
 * failure here does not leave a reconnecting socket behind. Connection
 * is disposed in the finally block.
 */
export async function isRedisReachable(
  url: string,
  timeoutMs = 2000,
): Promise<boolean> {
  let client: Redis | null = null;
  try {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      connectTimeout: timeoutMs,
      // Silence ioredis's own console-spammy reconnect logic — we only
      // care about the one-shot result.
      retryStrategy: () => null,
    });
    // ioredis emits 'error' on connect failure BEFORE our await sees the
    // rejection, which Node would then log as "Unhandled error event".
    // Attach a noop listener so the probe is visually silent when Redis
    // is down (we already communicate that via the boolean return).
    client.on('error', () => {});
    await Promise.race([
      (async () => {
        await client!.connect();
        await client!.ping();
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis probe timeout')), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (client) {
      // `disconnect()` is synchronous, doesn't wait for pending commands
      // — which is what we want: we already have our answer.
      client.disconnect();
    }
  }
}
