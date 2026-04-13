/**
 * EAP Partnership routes — 企业 org ↔ 心理服务机构 org 合作关系管理
 *
 * Mounted at /api/orgs/:orgId/eap/partnerships
 * Requires: authGuard + orgContextGuard + requireFeature('eap')
 *
 * GET    /                 — List partnerships for current org
 * POST   /                 — Create partnership (enterprise org invites provider)
 * GET    /:id              — Get partnership detail
 * PATCH  /:id              — Update partnership (status, contract terms)
 * DELETE /:id              — Delete partnership
 */
import type { FastifyInstance } from 'fastify';
import { eq, and, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { eapPartnerships, organizations, eapCounselorAssignments, users } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireFeature } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

export async function eapPartnershipRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireFeature('partnership'));
  app.addHook('preHandler', requireRole('org_admin'));

  // ─── List Partnerships ───────────────────────────────────────────
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;

    // Show partnerships where this org is either the enterprise or the provider
    const partnerships = await db
      .select()
      .from(eapPartnerships)
      .where(
        or(
          eq(eapPartnerships.enterpriseOrgId, orgId),
          eq(eapPartnerships.providerOrgId, orgId),
        ),
      )
      .orderBy(eapPartnerships.createdAt);

    // Enrich with org names
    const enriched = await Promise.all(
      partnerships.map(async (p) => {
        const otherOrgId = p.enterpriseOrgId === orgId ? p.providerOrgId : p.enterpriseOrgId;
        const [otherOrg] = await db
          .select({ name: organizations.name, slug: organizations.slug })
          .from(organizations)
          .where(eq(organizations.id, otherOrgId))
          .limit(1);

        // Count assigned counselors
        const assignmentRows = await db
          .select()
          .from(eapCounselorAssignments)
          .where(and(
            eq(eapCounselorAssignments.partnershipId, p.id),
            eq(eapCounselorAssignments.status, 'active'),
          ));

        return {
          ...p,
          role: p.enterpriseOrgId === orgId ? 'enterprise' : 'provider',
          partnerOrg: otherOrg ?? { name: '(已删除)', slug: '' },
          assignedCounselorCount: assignmentRows.length,
        };
      }),
    );

    return { partnerships: enriched };
  });

  // ─── Create Partnership ──────────────────────────────────────────
  app.post('/', async (request, reply) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      providerOrgId: string;
      contractStart?: string;
      contractEnd?: string;
      seatAllocation?: number;
      serviceScope?: Record<string, boolean>;
      notes?: string;
    };

    if (!body.providerOrgId) {
      throw new ValidationError('providerOrgId is required');
    }

    // Verify provider org exists
    const [providerOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, body.providerOrgId))
      .limit(1);

    if (!providerOrg) {
      throw new NotFoundError('Provider organization not found');
    }

    // Check for existing partnership
    const [existing] = await db
      .select()
      .from(eapPartnerships)
      .where(and(
        eq(eapPartnerships.enterpriseOrgId, orgId),
        eq(eapPartnerships.providerOrgId, body.providerOrgId),
      ))
      .limit(1);

    if (existing) {
      throw new ValidationError('Partnership already exists with this organization');
    }

    const [partnership] = await db
      .insert(eapPartnerships)
      .values({
        enterpriseOrgId: orgId,
        providerOrgId: body.providerOrgId,
        status: 'active',
        contractStart: body.contractStart ? new Date(body.contractStart) : null,
        contractEnd: body.contractEnd ? new Date(body.contractEnd) : null,
        seatAllocation: body.seatAllocation ?? null,
        serviceScope: body.serviceScope ?? {},
        notes: body.notes ?? null,
        createdBy: request.user!.id,
      })
      .returning();

    reply.code(201);
    return { partnership };
  });

  // ─── Get Partnership Detail ──────────────────────────────────────
  app.get('/:partnershipId', async (request) => {
    const { partnershipId } = request.params as { partnershipId: string };
    const orgId = request.org!.orgId;

    const [partnership] = await db
      .select()
      .from(eapPartnerships)
      .where(and(
        eq(eapPartnerships.id, partnershipId),
        or(
          eq(eapPartnerships.enterpriseOrgId, orgId),
          eq(eapPartnerships.providerOrgId, orgId),
        ),
      ))
      .limit(1);

    if (!partnership) {
      throw new NotFoundError('Partnership not found');
    }

    // Load assigned counselors
    const assignments = await db
      .select({
        id: eapCounselorAssignments.id,
        counselorUserId: eapCounselorAssignments.counselorUserId,
        status: eapCounselorAssignments.status,
        assignedAt: eapCounselorAssignments.assignedAt,
        counselorName: users.name,
        counselorEmail: users.email,
      })
      .from(eapCounselorAssignments)
      .leftJoin(users, eq(users.id, eapCounselorAssignments.counselorUserId))
      .where(eq(eapCounselorAssignments.partnershipId, partnershipId));

    // Load partner org info
    const otherOrgId = partnership.enterpriseOrgId === orgId
      ? partnership.providerOrgId
      : partnership.enterpriseOrgId;
    const [partnerOrg] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, otherOrgId))
      .limit(1);

    return {
      partnership: {
        ...partnership,
        role: partnership.enterpriseOrgId === orgId ? 'enterprise' : 'provider',
        partnerOrg: partnerOrg ?? { name: '(已删除)', slug: '' },
      },
      assignments,
    };
  });

  // ─── Update Partnership ──────────────────────────────────────────
  app.patch('/:partnershipId', async (request) => {
    const { partnershipId } = request.params as { partnershipId: string };
    const orgId = request.org!.orgId;
    const body = request.body as Partial<{
      status: string;
      contractStart: string;
      contractEnd: string;
      seatAllocation: number;
      serviceScope: Record<string, boolean>;
      notes: string;
    }>;

    const [partnership] = await db
      .select()
      .from(eapPartnerships)
      .where(and(
        eq(eapPartnerships.id, partnershipId),
        or(
          eq(eapPartnerships.enterpriseOrgId, orgId),
          eq(eapPartnerships.providerOrgId, orgId),
        ),
      ))
      .limit(1);

    if (!partnership) {
      throw new NotFoundError('Partnership not found');
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) updateData.status = body.status;
    if (body.contractStart) updateData.contractStart = new Date(body.contractStart);
    if (body.contractEnd) updateData.contractEnd = new Date(body.contractEnd);
    if (body.seatAllocation !== undefined) updateData.seatAllocation = body.seatAllocation;
    if (body.serviceScope) updateData.serviceScope = body.serviceScope;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const [updated] = await db
      .update(eapPartnerships)
      .set(updateData)
      .where(eq(eapPartnerships.id, partnershipId))
      .returning();

    return { partnership: updated };
  });

  // ─── Delete Partnership ──────────────────────────────────────────
  app.delete('/:partnershipId', async (request, reply) => {
    const { partnershipId } = request.params as { partnershipId: string };
    const orgId = request.org!.orgId;

    const [partnership] = await db
      .select()
      .from(eapPartnerships)
      .where(and(
        eq(eapPartnerships.id, partnershipId),
        or(
          eq(eapPartnerships.enterpriseOrgId, orgId),
          eq(eapPartnerships.providerOrgId, orgId),
        ),
      ))
      .limit(1);

    if (!partnership) {
      throw new NotFoundError('Partnership not found');
    }

    // Delete will cascade to eap_counselor_assignments
    await db
      .delete(eapPartnerships)
      .where(eq(eapPartnerships.id, partnershipId));

    reply.code(204);
  });
}
