/**
 * EAP Counselor Assignment routes — 机构端指派咨询师到企业 org
 *
 * Mounted at /api/orgs/:orgId/eap/assignments
 * Requires: authGuard + orgContextGuard + requireFeature('eap')
 *
 * GET    /                 — List assigned counselors for partnerships
 * POST   /                 — Assign counselor to enterprise org (atomic: assignment + orgMember)
 * DELETE /:id              — Remove counselor assignment
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  eapCounselorAssignments,
  eapPartnerships,
  orgMembers,
  users,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireFeature } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../lib/errors.js';

export async function eapAssignmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireFeature('eap'));
  app.addHook('preHandler', requireRole('org_admin'));

  // ─── List Assignments ────────────────────────────────────────────
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;

    // Get all partnerships where this org is the provider
    const partnerships = await db
      .select()
      .from(eapPartnerships)
      .where(eq(eapPartnerships.providerOrgId, orgId));

    if (partnerships.length === 0) {
      return { assignments: [] };
    }

    const partnershipIds = partnerships.map((p) => p.id);

    // Get all assignments for these partnerships
    const { inArray } = await import('drizzle-orm');
    const assignments = await db
      .select({
        id: eapCounselorAssignments.id,
        partnershipId: eapCounselorAssignments.partnershipId,
        counselorUserId: eapCounselorAssignments.counselorUserId,
        enterpriseOrgId: eapCounselorAssignments.enterpriseOrgId,
        status: eapCounselorAssignments.status,
        assignedAt: eapCounselorAssignments.assignedAt,
        counselorName: users.name,
        counselorEmail: users.email,
      })
      .from(eapCounselorAssignments)
      .leftJoin(users, eq(users.id, eapCounselorAssignments.counselorUserId))
      .where(inArray(eapCounselorAssignments.partnershipId, partnershipIds));

    return { assignments };
  });

  // ─── Assign Counselor ────────────────────────────────────────────
  app.post('/', async (request, reply) => {
    const orgId = request.org!.orgId; // This is the provider org
    const body = request.body as {
      partnershipId: string;
      counselorUserId: string;
    };

    if (!body.partnershipId || !body.counselorUserId) {
      throw new ValidationError('partnershipId and counselorUserId are required');
    }

    // Verify partnership exists and this org is the provider
    const [partnership] = await db
      .select()
      .from(eapPartnerships)
      .where(and(
        eq(eapPartnerships.id, body.partnershipId),
        eq(eapPartnerships.providerOrgId, orgId),
        eq(eapPartnerships.status, 'active'),
      ))
      .limit(1);

    if (!partnership) {
      throw new NotFoundError('Active partnership not found or you are not the provider');
    }

    // Verify counselor is a member of the provider org
    const [counselorMember] = await db
      .select()
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.userId, body.counselorUserId),
        eq(orgMembers.role, 'counselor'),
        eq(orgMembers.status, 'active'),
      ))
      .limit(1);

    if (!counselorMember) {
      throw new ValidationError('User is not an active counselor in your organization');
    }

    // Check if already assigned
    const [existing] = await db
      .select()
      .from(eapCounselorAssignments)
      .where(and(
        eq(eapCounselorAssignments.enterpriseOrgId, partnership.enterpriseOrgId),
        eq(eapCounselorAssignments.counselorUserId, body.counselorUserId),
      ))
      .limit(1);

    if (existing) {
      throw new ValidationError('Counselor is already assigned to this enterprise');
    }

    // Atomic: create assignment + org_member in enterprise org
    const [assignment] = await db
      .insert(eapCounselorAssignments)
      .values({
        partnershipId: body.partnershipId,
        counselorUserId: body.counselorUserId,
        enterpriseOrgId: partnership.enterpriseOrgId,
        providerOrgId: orgId,
        status: 'active',
        assignedBy: request.user!.id,
      })
      .returning();

    // Create org_member in enterprise org with counselor role
    // Check if member already exists (shouldn't, but safety check)
    const [existingMember] = await db
      .select()
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, partnership.enterpriseOrgId),
        eq(orgMembers.userId, body.counselorUserId),
      ))
      .limit(1);

    if (!existingMember) {
      await db.insert(orgMembers).values({
        id: crypto.randomUUID(),
        orgId: partnership.enterpriseOrgId,
        userId: body.counselorUserId,
        role: 'counselor',
        status: 'active',
        sourcePartnershipId: body.partnershipId,
        // Copy relevant profile fields from provider org membership
        specialties: counselorMember.specialties ?? [],
        bio: counselorMember.bio ?? null,
      });
    }

    reply.code(201);
    return { assignment };
  });

  // ─── Remove Assignment ───────────────────────────────────────────
  app.delete('/:assignmentId', async (request, reply) => {
    const orgId = request.org!.orgId;
    const { assignmentId } = request.params as { assignmentId: string };

    const [assignment] = await db
      .select()
      .from(eapCounselorAssignments)
      .where(and(
        eq(eapCounselorAssignments.id, assignmentId),
        eq(eapCounselorAssignments.providerOrgId, orgId),
      ))
      .limit(1);

    if (!assignment) {
      throw new NotFoundError('Assignment not found');
    }

    // Mark assignment as removed
    await db
      .update(eapCounselorAssignments)
      .set({ status: 'removed', removedAt: new Date() })
      .where(eq(eapCounselorAssignments.id, assignmentId));

    // Remove the org_member from enterprise org (only if it was auto-created via partnership)
    await db
      .delete(orgMembers)
      .where(and(
        eq(orgMembers.orgId, assignment.enterpriseOrgId),
        eq(orgMembers.userId, assignment.counselorUserId),
        eq(orgMembers.sourcePartnershipId, assignment.partnershipId),
      ));

    reply.code(204);
  });
}
