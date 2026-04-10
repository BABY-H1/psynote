import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

export const complianceQueue = new Queue('compliance', { connection });
export const reminderQueue = new Queue('reminders', { connection });

// Phase 9δ — Follow-up reminder queue.
// A separate queue (not the appointment reminder queue) so retention/retry/
// concurrency can be tuned independently. The repeated job is scheduled in
// `follow-up-reminder.worker.ts` on boot.
export const followUpQueue = new Queue('follow-up', { connection });
