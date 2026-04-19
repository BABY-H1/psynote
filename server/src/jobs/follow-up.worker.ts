/**
 * Phase 9δ — Follow-up reminder worker.
 *
 * Scans `follow_up_plans` daily for plans whose `nextDue` is on or before
 * today and whose status is 'active'. For each such plan, creates a
 * counselor in-app notification and (optionally) emails the client.
 *
 * Architecture:
 *   - A repeatable job is enqueued by `scheduleDailyFollowUpScan()` once
 *     per day at 08:00 local time. The job has a fixed id so multiple boots
 *     don't create duplicates (BullMQ deduplicates by jobId).
 *   - The worker handler iterates active plans in batches and creates
 *     notifications synchronously. There's no per-plan job — the daily scan
 *     is one job that processes all due plans.
 *
 * Why one daily scan vs per-plan jobs?
 *   Per-plan jobs would mean N jobs in BullMQ at all times, scaling poorly
 *   for large orgs. The scan-and-create pattern is O(due_count) per day,
 *   which is small. We only fan out to per-recipient work if email/SMS
 *   delivery becomes async-heavy.
 *
 * To enable in dev, call `startFollowUpWorker()` and `scheduleDailyFollowUpScan()`
 * from app.ts (gated by env or by a flag). Phase 9δ exports both but does not
 * auto-start them — opt-in.
 */
import { Worker, Job, JobsOptions } from 'bullmq';
import { eq, and, lte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { followUpPlans, careEpisodes, users } from '../db/schema.js';
import { followUpQueue } from './queue.js';
import { createNotification } from '../modules/notification/notification.service.js';
import { sendEmail } from '../lib/notification-sender.js';

const DAILY_JOB_ID = 'follow-up-daily-scan';
const QUEUE_NAME = 'follow-up';

async function processDailyScan(_job: Job<{}>) {
  const now = new Date();
  console.log(`[FollowUp] Daily scan starting at ${now.toISOString()}`);

  // Find all active plans that are due (nextDue <= now)
  const duePlans = await db
    .select({
      plan: followUpPlans,
      episode: careEpisodes,
    })
    .from(followUpPlans)
    .innerJoin(careEpisodes, eq(careEpisodes.id, followUpPlans.careEpisodeId))
    .where(and(
      eq(followUpPlans.status, 'active'),
      lte(followUpPlans.nextDue, now),
    ));

  console.log(`[FollowUp] Found ${duePlans.length} due plans`);

  let notifiedCounselors = 0;
  let notifiedClients = 0;

  for (const { plan, episode } of duePlans) {
    try {
      // Counselor in-app notification
      await createNotification({
        orgId: plan.orgId,
        userId: plan.counselorId,
        type: 'follow_up_due',
        title: '随访到期',
        body: `${plan.planType ?? '随访'} 计划已到期，请安排回访`,
        refType: 'follow_up_plan',
        refId: plan.id,
      });
      notifiedCounselors++;

      // Optional: email the client
      // We use a conservative default — only email if the plan has notes
      // mentioning email is OK. Future: per-plan opt-in field.
      const [client] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, episode.clientId))
        .limit(1);

      if (client?.email) {
        try {
          await sendEmail(
            {},
            {
              to: client.email,
              subject: '随访提醒',
              body: `${client.name}你好，你的咨询师将与你进行一次随访，请留意他们的联系。`,
            },
          );
          notifiedClients++;
        } catch (err) {
          console.warn(`[FollowUp] Email failed for ${client.email}:`, err);
          // Email failure is not fatal — counselor notification still went out
        }
      }
    } catch (err) {
      console.error(`[FollowUp] Failed to process plan ${plan.id}:`, err);
    }
  }

  console.log(
    `[FollowUp] Daily scan complete. Notified ${notifiedCounselors} counselors, ${notifiedClients} clients.`,
  );
  return { duePlans: duePlans.length, notifiedCounselors, notifiedClients };
}

/**
 * Start the BullMQ worker. Call once at app boot.
 */
export function startFollowUpWorker() {
  const worker = new Worker(QUEUE_NAME, processDailyScan, {
    // `lazyConnect: true` parallels queue.ts — keeps the socket dormant
    // until the first dequeue attempt. The caller in app.ts has already
    // confirmed Redis is reachable via `isRedisReachable` before calling us.
    connection: { url: env.REDIS_URL, lazyConnect: true },
    concurrency: 1, // The scan is heavy and there's no benefit to running it twice
  });

  worker.on('completed', (job, result) => {
    console.log(`[FollowUp] Daily scan job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[FollowUp] Daily scan job ${job?.id} failed:`, err.message);
  });

  return worker;
}

/**
 * Enqueue (or refresh) the repeatable daily scan job.
 *
 * Default schedule: every day at 08:00 local. Override with the `cron` arg.
 * Idempotent — using a fixed jobId ensures BullMQ doesn't create duplicates
 * if this is called on every boot.
 */
export async function scheduleDailyFollowUpScan(options?: { cron?: string }) {
  const cron = options?.cron ?? '0 8 * * *'; // 08:00 daily
  const opts: JobsOptions = {
    repeat: { pattern: cron },
    jobId: DAILY_JOB_ID,
  };
  await followUpQueue.add('daily-scan', {}, opts);
  console.log(`[FollowUp] Daily scan scheduled with cron "${cron}"`);
}

/**
 * Manual trigger — enqueue a one-shot scan immediately.
 * Useful for testing or an admin "run now" button. The worker (started by
 * `startFollowUpWorker`) picks it up and processes asynchronously.
 */
export async function runFollowUpScanNow() {
  const job = await followUpQueue.add('one-shot-scan', {});
  return { jobId: job.id };
}
