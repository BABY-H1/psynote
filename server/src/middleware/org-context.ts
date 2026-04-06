import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { queryClient } from '../config/database.js';
import { orgMembers } from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { env } from '../config/env.js';
import type { OrgRole } from '@psynote/shared';

export interface OrgContext {
  orgId: string;
  role: OrgRole;
  memberId: string;
  supervisorId: string | null;
  fullPracticeAccess: boolean;
  superviseeUserIds: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    org?: OrgContext;
  }
}

/**
 * Middleware that resolves the org from :orgId param,
 * verifies user membership, and sets PostgreSQL session vars for RLS.
 */
export async function orgContextGuard(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId?: string };
  if (!orgId) {
    throw new NotFoundError('Organization ID is required');
  }

  const userId = request.user?.id;
  if (!userId) {
    throw new ForbiddenError('Authentication required before org context');
  }

  // System admin bypass: full access to any org without membership
  if (request.user?.isSystemAdmin) {
    request.org = {
      orgId,
      role: 'org_admin',
      memberId: 'system-admin',
      supervisorId: null,
      fullPracticeAccess: true,
      superviseeUserIds: [],
    };
    await queryClient`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    await queryClient`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return;
  }

  // Look up membership
  const [member] = await db
    .select()
    .from(orgMembers)
    .where(and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.userId, userId),
      eq(orgMembers.status, 'active'),
    ))
    .limit(1);

  // Dev mode: if no membership found, use dev role header
  if (!member && env.NODE_ENV === 'development') {
    const devRole = (request.headers['x-dev-role'] as string) || 'counselor';
    request.org = {
      orgId,
      role: devRole as OrgRole,
      memberId: 'dev-member',
      supervisorId: null,
      fullPracticeAccess: devRole === 'org_admin',
      superviseeUserIds: [],
    };
    await queryClient`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    await queryClient`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return;
  }

  if (!member) {
    throw new ForbiddenError('You are not a member of this organization');
  }

  // Check validity period
  if (member.validUntil && new Date(member.validUntil) < new Date()) {
    throw new ForbiddenError('Your membership has expired');
  }

  // Load supervisee user IDs (people this member supervises)
  let superviseeUserIds: string[] = [];
  if (member.role === 'counselor' || member.role === 'org_admin') {
    const supervisees = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.supervisorId, member.id),
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.status, 'active'),
      ));
    superviseeUserIds = supervisees.map((s) => s.userId);
  }

  request.org = {
    orgId,
    role: member.role as OrgRole,
    memberId: member.id,
    supervisorId: member.supervisorId ?? null,
    fullPracticeAccess: member.fullPracticeAccess ?? (member.role === 'org_admin'),
    superviseeUserIds,
  };

  // Set PostgreSQL session variables for RLS
  await queryClient`SELECT set_config('app.current_org_id', ${orgId}, true)`;
  await queryClient`SELECT set_config('app.current_user_id', ${userId}, true)`;
}
