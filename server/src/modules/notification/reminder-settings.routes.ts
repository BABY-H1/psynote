import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { db } from '../../config/database.js';
import { reminderSettings, appointments } from '../../db/schema.js';

export async function reminderSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Get reminder settings */
  app.get('/', async (request) => {
    const [settings] = await db.select().from(reminderSettings)
      .where(eq(reminderSettings.orgId, request.org!.orgId)).limit(1);
    return settings || { enabled: true, channels: ['email'], remindBefore: [1440, 60] };
  });

  /** Update reminder settings (upsert) */
  app.put('/', { preHandler: [requireRole('org_admin')] }, async (request) => {
    const body = request.body as Record<string, unknown>;
    const orgId = request.org!.orgId;

    const [existing] = await db.select().from(reminderSettings)
      .where(eq(reminderSettings.orgId, orgId)).limit(1);

    if (existing) {
      const [updated] = await db.update(reminderSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(reminderSettings.orgId, orgId)).returning();
      await logAudit(request, 'update', 'reminder_settings', updated.id);
      return updated;
    }

    const [created] = await db.insert(reminderSettings)
      .values({ orgId, ...body }).returning();
    await logAudit(request, 'create', 'reminder_settings', created.id);
    return created;
  });
}

/** Public endpoints for confirm/cancel via email link (no auth) */
export async function publicAppointmentRoutes(app: FastifyInstance) {
  app.get('/confirm/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const [appt] = await db.select().from(appointments)
      .where(eq(appointments.confirmToken, token)).limit(1);

    if (!appt) return reply.status(404).send({ error: '链接无效或已过期' });

    await db.update(appointments)
      .set({ clientConfirmedAt: new Date() })
      .where(eq(appointments.id, appt.id));

    return reply.type('text/html').send(`
      <html><head><meta charset="utf-8"><title>预约已确认</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="color:#16a34a">预约已确认</h1>
        <p>您的预约已成功确认。</p>
        <p>时间：${new Date(appt.startTime).toLocaleString('zh-CN')}</p>
      </body></html>
    `);
  });

  app.get('/cancel/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const [appt] = await db.select().from(appointments)
      .where(eq(appointments.confirmToken, token)).limit(1);

    if (!appt) return reply.status(404).send({ error: '链接无效或已过期' });

    await db.update(appointments)
      .set({ status: 'cancelled' })
      .where(eq(appointments.id, appt.id));

    // Cancel pending reminder jobs
    const { cancelReminders } = await import('../../jobs/schedule-reminders.js');
    await cancelReminders(appt.id);

    return reply.type('text/html').send(`
      <html><head><meta charset="utf-8"><title>预约已取消</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="color:#dc2626">预约已取消</h1>
        <p>您的预约已取消。如需重新预约，请联系咨询师。</p>
      </body></html>
    `);
  });
}
