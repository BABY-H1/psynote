import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

export const complianceQueue = new Queue('compliance', { connection });
export const reminderQueue = new Queue('reminders', { connection });
