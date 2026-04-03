import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { appointments, reminderSettings, users, clientProfiles } from '../db/schema.js';
import { sendEmail, buildReminderMessage } from '../lib/notification-sender.js';
import { createNotification } from '../modules/notification/notification.service.js';

interface ReminderJobData {
  appointmentId: string;
  type: '24h' | '1h';
}

async function processReminder(job: Job<ReminderJobData>) {
  const { appointmentId, type } = job.data;

  // Fetch appointment
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) return;
  if (appt.status === 'cancelled' || appt.status === 'completed') return;

  // Check if already sent
  if (type === '24h' && appt.reminderSent24h) return;
  if (type === '1h' && appt.reminderSent1h) return;

  // Get client info
  const [client] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, appt.clientId)).limit(1);
  const [counselor] = await db.select({ name: users.name }).from(users).where(eq(users.id, appt.counselorId)).limit(1);

  if (!client) return;

  // Get org reminder settings
  const [settings] = await db.select().from(reminderSettings).where(eq(reminderSettings.orgId, appt.orgId)).limit(1);
  if (settings && !settings.enabled) return;

  const baseUrl = env.CLIENT_URL;
  const vars = {
    clientName: client.name,
    counselorName: counselor?.name || '',
    time: new Date(appt.startTime).toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' }),
    confirmLink: `${baseUrl}/api/public/appointments/confirm/${appt.confirmToken || ''}`,
    cancelLink: `${baseUrl}/api/public/appointments/cancel/${appt.confirmToken || ''}`,
  };

  const template = (settings?.messageTemplate as any) || null;
  const { subject, body } = buildReminderMessage(template, vars);

  // Send email
  const emailConfig = (settings?.emailConfig as any) || {};
  await sendEmail(emailConfig, { to: client.email, subject, body });

  // Mark as sent
  const updateField = type === '24h' ? { reminderSent24h: true } : { reminderSent1h: true };
  await db.update(appointments).set(updateField).where(eq(appointments.id, appointmentId));

  // In-app notification
  await createNotification({
    orgId: appt.orgId,
    userId: appt.clientId,
    type: 'appointment_reminder',
    title: subject,
    body,
    refType: 'appointment',
    refId: appointmentId,
  });

  console.log(`[Reminder] ${type} reminder sent for appointment ${appointmentId} to ${client.email}`);
}

export function startReminderWorker() {
  const worker = new Worker('reminders', processReminder, {
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[Reminder] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Reminder] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
