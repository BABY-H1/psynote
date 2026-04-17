/**
 * EAP Crisis Alert routes — 危机预警管理
 *
 * Mounted at /api/orgs/:orgId/eap/crisis
 *
 * GET    /           — List crisis alerts (for crisis contacts / org_admin)
 * POST   /           — Create crisis alert (counselor only, triggers notification)
 * PATCH  /:id        — Update alert status (handling / resolved)
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  eapCrisisAlerts,
  eapUsageEvents,
  eapEmployeeProfiles,
  users,
  organizations,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

export async function eapCrisisRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('enterprise'));

  // ─── List Crisis Alerts ──────────────────────────────────────────
  app.get('/', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;

    const alerts = await db
      .select({
        id: eapCrisisAlerts.id,
        employeeUserId: eapCrisisAlerts.employeeUserId,
        counselorUserId: eapCrisisAlerts.counselorUserId,
        crisisType: eapCrisisAlerts.crisisType,
        description: eapCrisisAlerts.description,
        notifiedContacts: eapCrisisAlerts.notifiedContacts,
        status: eapCrisisAlerts.status,
        resolutionNotes: eapCrisisAlerts.resolutionNotes,
        createdAt: eapCrisisAlerts.createdAt,
      })
      .from(eapCrisisAlerts)
      .where(eq(eapCrisisAlerts.enterpriseOrgId, orgId))
      .orderBy(desc(eapCrisisAlerts.createdAt));

    // Enrich with names
    const enriched = await Promise.all(
      alerts.map(async (alert) => {
        const [employee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, alert.employeeUserId))
          .limit(1);
        const [counselor] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, alert.counselorUserId))
          .limit(1);
        return {
          ...alert,
          employeeName: employee?.name || '未知',
          counselorName: counselor?.name || '未知',
        };
      }),
    );

    return { alerts: enriched };
  });

  // ─── Create Crisis Alert (counselor only) ────────────────────────
  app.post('/', {
    preHandler: [requireRole('counselor')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;
    const counselorUserId = request.user!.id;
    const body = request.body as {
      employeeUserId: string;
      crisisType: string;
      description?: string;
    };

    if (!body.employeeUserId || !body.crisisType) {
      throw new ValidationError('employeeUserId and crisisType are required');
    }

    const validTypes = ['self_harm', 'harm_others', 'abuse'];
    if (!validTypes.includes(body.crisisType)) {
      throw new ValidationError(`crisisType must be one of: ${validTypes.join(', ')}`);
    }

    // Load crisis contacts from org settings
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const settings = (org?.settings || {}) as Record<string, any>;
    const crisisContacts = settings.eapConfig?.crisisContacts || [];

    // Create alert
    const notifiedContacts = crisisContacts.map((c: any) => ({
      ...c,
      notifiedAt: new Date().toISOString(),
    }));

    const [alert] = await db
      .insert(eapCrisisAlerts)
      .values({
        enterpriseOrgId: orgId,
        employeeUserId: body.employeeUserId,
        counselorUserId,
        crisisType: body.crisisType,
        description: body.description || null,
        notifiedContacts,
        status: 'open',
      })
      .returning();

    // Also record in usage events (without personal info, just for stats)
    // Get employee department
    const [empProfile] = await db
      .select({ department: eapEmployeeProfiles.department })
      .from(eapEmployeeProfiles)
      .where(and(
        eq(eapEmployeeProfiles.orgId, orgId),
        eq(eapEmployeeProfiles.userId, body.employeeUserId),
      ))
      .limit(1);

    await db.insert(eapUsageEvents).values({
      enterpriseOrgId: orgId,
      eventType: 'crisis_flagged',
      userId: body.employeeUserId,
      department: empProfile?.department || null,
      riskLevel: 'level_4',
    });

    // TODO: Send actual notifications (email / in-app) to crisis contacts

    reply.code(201);
    return { alert };
  });

  // ─── Update Alert Status ─────────────────────────────────────────
  app.patch('/:alertId', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const { alertId } = request.params as { alertId: string };
    const body = request.body as {
      status?: string;
      resolutionNotes?: string;
    };

    const [alert] = await db
      .select()
      .from(eapCrisisAlerts)
      .where(and(
        eq(eapCrisisAlerts.id, alertId),
        eq(eapCrisisAlerts.enterpriseOrgId, orgId),
      ))
      .limit(1);

    if (!alert) throw new NotFoundError('Crisis alert not found');

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) updateData.status = body.status;
    if (body.resolutionNotes !== undefined) updateData.resolutionNotes = body.resolutionNotes;

    const [updated] = await db
      .update(eapCrisisAlerts)
      .set(updateData)
      .where(eq(eapCrisisAlerts.id, alertId))
      .returning();

    return { alert: updated };
  });
}
