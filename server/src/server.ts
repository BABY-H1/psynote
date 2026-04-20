import { buildApp } from './app.js';
import { env } from './config/env.js';

/**
 * Server entry point — bootstraps the Fastify app via `buildApp()` and
 * starts background workers. This is the only file that binds a port
 * or has process-level side effects; `app.ts` stays a pure factory so
 * tests and alternate entry points (e.g. a future worker-only process)
 * can reuse the wiring without hauling in the HTTP listener.
 */
async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);

    // Start follow-up worker — requires Redis. Probe first with a tight
    // timeout; skip worker init entirely when Redis is down so BullMQ's
    // background reconnect loop doesn't saturate the event loop and take
    // the dev server with it.
    const { isRedisReachable } = await import('./lib/redis-health.js');
    const redisUp = await isRedisReachable(env.REDIS_URL);
    if (!redisUp) {
      app.log.warn(`Follow-up worker skipped: Redis unreachable at ${env.REDIS_URL}`);
    } else {
      try {
        const { startFollowUpWorker, scheduleDailyFollowUpScan } = await import('./jobs/follow-up.worker.js');
        startFollowUpWorker();
        await scheduleDailyFollowUpScan();
        app.log.info('Follow-up worker started');
      } catch (workerErr: any) {
        app.log.warn(`Follow-up worker failed to start: ${workerErr.message}`);
      }
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
