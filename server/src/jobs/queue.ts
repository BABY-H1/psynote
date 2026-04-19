import { Queue } from 'bullmq';
import { env } from '../config/env.js';

// `lazyConnect: true` keeps the ioredis socket idle until the first command
// (queue.add, worker dequeue, etc). Without this, BullMQ opens 3 sockets at
// module import time and — if Redis is down — floods the event loop with
// reconnect AggregateErrors that eventually kill the dev server via
// unhandledRejection. With lazyConnect, the Redis dependency is truly opt-in:
// callers that never enqueue pay nothing. See `lib/redis-health.ts` for the
// startup probe that decides whether to spin the worker at all.
const connection = { url: env.REDIS_URL, lazyConnect: true };

export const complianceQueue = new Queue('compliance', { connection });
export const reminderQueue = new Queue('reminders', { connection });

// Phase 9δ — Follow-up reminder queue.
// A separate queue (not the appointment reminder queue) so retention/retry/
// concurrency can be tuned independently. The repeated job is scheduled in
// `follow-up-reminder.worker.ts` on boot.
export const followUpQueue = new Queue('follow-up', { connection });
