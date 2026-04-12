/**
 * Seat-limit middleware.
 *
 * Checks that the org has not exceeded the `maxSeats` defined in its license.
 * Use on member-creation routes (invite / add member) AFTER `orgContextGuard`.
 *
 * If no license or no seat limit is set, the check is a no-op (unlimited).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { orgMembers } from '../db/schema.js';
import { ForbiddenError } from '../lib/errors.js';

export function requireSeat() {
  return async function seatGuard(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.org) {
      throw new ForbiddenError('requireSeat must be used after orgContextGuard');
    }

    const { license, orgId } = request.org;

    // No license or no seat cap → unlimited
    if (!license.maxSeats) return;

    const [result] = await db
      .select({ value: count() })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.status, 'active'),
      ));

    if (result.value >= license.maxSeats) {
      throw new ForbiddenError(
        `已达到许可证席位上限（${license.maxSeats} 人），请升级许可证或移除不活跃成员`,
      );
    }
  };
}
