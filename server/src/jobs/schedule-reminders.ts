import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { appointments, reminderSettings } from '../db/schema.js';
import { reminderQueue } from './queue.js';

/**
 * Schedule reminder jobs for an appointment.
 * Call this after creating or confirming an appointment.
 */
export async function scheduleReminders(appointmentId: string, orgId: string, startTime: Date) {
  // Generate confirm token if not exists
  const token = randomBytes(32).toString('hex');
  await db.update(appointments).set({ confirmToken: token }).where(eq(appointments.id, appointmentId));

  // Get org reminder settings
  const [settings] = await db.select().from(reminderSettings).where(eq(reminderSettings.orgId, orgId)).limit(1);
  if (settings && !settings.enabled) return;

  const remindBefore = (settings?.remindBefore as number[]) || [1440, 60]; // default: 24h and 1h
  const now = Date.now();

  for (const minutesBefore of remindBefore) {
    const reminderTime = startTime.getTime() - minutesBefore * 60 * 1000;
    const delay = reminderTime - now;

    if (delay > 0) {
      const type = minutesBefore >= 1440 ? '24h' : '1h';
      await reminderQueue.add(
        'send-reminder',
        { appointmentId, type },
        {
          delay,
          jobId: `${appointmentId}-${type}`,
          removeOnComplete: true,
        },
      );
      console.log(`[Reminder] Scheduled ${type} reminder for appointment ${appointmentId} in ${Math.round(delay / 60000)}min`);
    }
  }
}

/**
 * Cancel pending reminder jobs for an appointment.
 */
export async function cancelReminders(appointmentId: string) {
  for (const type of ['24h', '1h']) {
    try {
      const job = await reminderQueue.getJob(`${appointmentId}-${type}`);
      if (job) await job.remove();
    } catch {
      // Job may already be processed or not exist
    }
  }
}
