/**
 * Phase 10 — Public service offering & intake endpoints.
 *
 * Public (no auth):
 *   GET  /api/public/orgs/:orgSlug/services       — list published services
 *   POST /api/public/orgs/:orgSlug/services/intake — submit consultation request
 *
 * Authenticated (org admin):
 *   GET  /api/orgs/:orgId/service-intakes          — list pending intakes
 *   POST /api/orgs/:orgId/service-intakes/:id/assign — assign intake to counselor
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, users, serviceIntakes, orgMembers, clientAssignments } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notification/notification.service.js';
import { randomUUID } from 'crypto';

// ─── Public routes (no auth) ────────────────────────────────────────

interface PublicService {
  id: string;
  title: string;
  description: string;
  sessionFormat: string;
  targetAudience?: string;
  availableCounselorIds: string[];
  intakeMode: string;
  isActive: boolean;
}

export async function publicServiceRoutes(app: FastifyInstance) {
  /** List published services for an org (by slug) */
  app.get('/api/public/orgs/:orgSlug/services', async (request) => {
    const { orgSlug } = request.params as { orgSlug: string };

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) return { services: [], orgName: '' };

    const publicServices: PublicService[] = (org.settings as any)?.publicServices ?? [];
    const active = publicServices.filter((s) => s.isActive);

    return {
      orgName: org.name,
      orgId: org.id,
      services: active.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        sessionFormat: s.sessionFormat,
        targetAudience: s.targetAudience,
        intakeMode: s.intakeMode,
      })),
    };
  });

  /** Submit a consultation request (public, creates user if needed) */
  app.post('/api/public/orgs/:orgSlug/services/intake', async (request, reply) => {
    const { orgSlug } = request.params as { orgSlug: string };
    const { serviceId, name, email, phone, chiefComplaint, counselorId } = request.body as {
      serviceId: string;
      name: string;
      email: string;
      phone?: string;
      chiefComplaint?: string;
      counselorId?: string; // from ?counselorId=xxx link
    };

    if (!serviceId || !name || !email) {
      return reply.status(400).send({ error: 'serviceId, name, email are required' });
    }

    // Resolve org
    const [org] = await db
      .select({ id: organizations.id, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) return reply.status(404).send({ error: 'Organization not found' });

    // Find or create user
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({
        id: randomUUID(),
        email,
        name,
      }).returning();
    }

    // Ensure user is org member (client role)
    const [existingMember] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)))
      .limit(1);

    if (!existingMember) {
      await db.insert(orgMembers).values({
        orgId: org.id,
        userId: user.id,
        role: 'client',
        status: 'active',
      });
    }

    // Check if org has only one counselor → auto-assign
    const counselors = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, org.id),
        eq(orgMembers.role, 'counselor'),
        eq(orgMembers.status, 'active'),
      ));

    const autoAssign = counselors.length === 1;
    const assignTo = autoAssign ? counselors[0].userId : undefined;

    // Create intake
    const [intake] = await db.insert(serviceIntakes).values({
      orgId: org.id,
      serviceId,
      clientUserId: user.id,
      preferredCounselorId: counselorId || null,
      intakeSource: counselorId ? 'counselor_referral' : 'org_portal',
      intakeData: { phone, chiefComplaint },
      status: autoAssign ? 'assigned' : 'pending',
      assignedCounselorId: assignTo || null,
      assignedAt: autoAssign ? new Date() : null,
    }).returning();

    // If auto-assigned, create client assignment too
    if (autoAssign && assignTo) {
      await db.insert(clientAssignments).values({
        orgId: org.id,
        clientId: user.id,
        counselorId: assignTo,
        isPrimary: true,
      }).onConflictDoNothing();

      await createNotification({
        orgId: org.id,
        userId: assignTo,
        type: 'new_intake',
        title: '新来访者咨询申请',
        body: `${name} 提交了咨询申请，已自动分配给您。`,
      });
    } else {
      // Notify all org_admins
      const admins = await db
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, 'org_admin')));

      for (const admin of admins) {
        await createNotification({
          orgId: org.id,
          userId: admin.userId,
          type: 'new_intake',
          title: '新来访者咨询申请',
          body: `${name} 提交了咨询申请${counselorId ? '（咨询师推荐）' : ''}，请前往协作中心分配。`,
        });
      }
    }

    return reply.status(201).send({
      intakeId: intake.id,
      status: intake.status,
      assignedCounselorId: intake.assignedCounselorId,
    });
  });
}

// ─── Authenticated routes (org admin) ───────────────────────────────

export async function serviceIntakeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List pending intakes */
  app.get('/', {
    preHandler: [requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;

    const intakes = await db
      .select({
        intake: serviceIntakes,
        clientName: users.name,
        clientEmail: users.email,
      })
      .from(serviceIntakes)
      .innerJoin(users, eq(users.id, serviceIntakes.clientUserId))
      .where(and(
        eq(serviceIntakes.orgId, orgId),
        eq(serviceIntakes.status, 'pending'),
      ))
      .orderBy(serviceIntakes.createdAt);

    return intakes.map((row) => ({
      ...row.intake,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
    }));
  });

  /** Assign an intake to a counselor */
  app.post('/:intakeId/assign', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const { intakeId } = request.params as { intakeId: string };
    const { counselorId } = request.body as { counselorId: string };
    const orgId = request.org!.orgId;

    // Get the intake
    const [intake] = await db
      .select()
      .from(serviceIntakes)
      .where(eq(serviceIntakes.id, intakeId))
      .limit(1);

    if (!intake) return reply.status(404).send({ error: 'Intake not found' });

    // Update intake
    await db.update(serviceIntakes).set({
      status: 'assigned',
      assignedCounselorId: counselorId,
      assignedAt: new Date(),
    }).where(eq(serviceIntakes.id, intakeId));

    // Create client assignment
    await db.insert(clientAssignments).values({
      orgId,
      clientId: intake.clientUserId,
      counselorId,
      isPrimary: true,
    }).onConflictDoNothing();

    // Notify counselor
    await createNotification({
      orgId,
      userId: counselorId,
      type: 'case_assigned',
      title: '新来访者分配',
      body: '管理员为您分配了一位新来访者，请查看交付中心。',
    });

    await logAudit(request, 'assign', 'service_intakes', intakeId, {
      counselorId: { old: null, new: counselorId },
    });

    return { success: true };
  });
}
