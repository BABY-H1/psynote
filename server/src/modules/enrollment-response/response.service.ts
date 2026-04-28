/**
 * Phase 9α — Enrollment block response service.
 *
 * Tracks a learner's responses and completion state for content blocks within
 * a specific enrollment (course or group). All responses flow through here;
 * reflection/worksheet/check_in text also passes the safety scanner.
 */

import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  enrollmentBlockResponses,
  courseEnrollments,
  groupEnrollments,
  courseContentBlocks,
  groupSessionBlocks,
} from '../../db/schema.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../lib/errors.js';
import { scanResponse, topSeverity, DEFAULT_CRISIS_RESOURCES } from '../safety/keyword-scanner.js';
import type { ContentBlockType, SafetyFlag } from '@psynote/shared';

export type EnrollmentType = 'course' | 'group';

// ─── Enrollment validation ──────────────────────────────────────────

/**
 * Assert that the caller (as a learner) owns this enrollment.
 * Used when the client portal submits a response.
 */
export async function assertEnrollmentOwnedByUser(
  enrollmentId: string,
  enrollmentType: EnrollmentType,
  userId: string,
): Promise<void> {
  if (enrollmentType === 'course') {
    const rows = await db
      .select({ id: courseEnrollments.id, userId: courseEnrollments.userId })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.id, enrollmentId))
      .limit(1);
    if (!rows[0]) throw new NotFoundError('CourseEnrollment', enrollmentId);
    if (rows[0].userId !== userId) {
      throw new ForbiddenError('This enrollment does not belong to you');
    }
  } else {
    const rows = await db
      .select({ id: groupEnrollments.id, userId: groupEnrollments.userId })
      .from(groupEnrollments)
      .where(eq(groupEnrollments.id, enrollmentId))
      .limit(1);
    if (!rows[0]) throw new NotFoundError('GroupEnrollment', enrollmentId);
    if (rows[0].userId !== userId) {
      throw new ForbiddenError('This enrollment does not belong to you');
    }
  }
}

/** Verify the block exists and get its type for denormalization into response row. */
async function getBlockType(
  blockId: string,
  enrollmentType: EnrollmentType,
): Promise<ContentBlockType> {
  if (enrollmentType === 'course') {
    const rows = await db
      .select({ blockType: courseContentBlocks.blockType })
      .from(courseContentBlocks)
      .where(eq(courseContentBlocks.id, blockId))
      .limit(1);
    if (!rows[0]) throw new NotFoundError('CourseContentBlock', blockId);
    return rows[0].blockType as ContentBlockType;
  } else {
    const rows = await db
      .select({ blockType: groupSessionBlocks.blockType })
      .from(groupSessionBlocks)
      .where(eq(groupSessionBlocks.id, blockId))
      .limit(1);
    if (!rows[0]) throw new NotFoundError('GroupSessionBlock', blockId);
    return rows[0].blockType as ContentBlockType;
  }
}

// ─── Submit response (upsert) ───────────────────────────────────────

export interface SubmitResponseInput {
  enrollmentId: string;
  enrollmentType: EnrollmentType;
  blockId: string;
  /** Learner's answer. null means "mark as completed" (e.g. video watched). */
  response: unknown | null;
  /** The user id of the learner. Used for ownership check. */
  userId: string;
}

export interface SubmitResponseResult {
  response: {
    id: string;
    enrollmentId: string;
    enrollmentType: string;
    blockId: string;
    blockType: string;
    response: unknown;
    completedAt: Date | null;
    safetyFlags: SafetyFlag[];
    reviewedByCounselor: boolean;
  };
  crisis: {
    severity: 'critical' | 'warning' | 'info';
    resources: typeof DEFAULT_CRISIS_RESOURCES;
  } | null;
}

export async function submitResponse(input: SubmitResponseInput): Promise<SubmitResponseResult> {
  await assertEnrollmentOwnedByUser(input.enrollmentId, input.enrollmentType, input.userId);
  const blockType = await getBlockType(input.blockId, input.enrollmentType);

  // Scan for safety flags if response contains text-like content
  const flags = input.response !== null ? scanResponse(input.response) : [];
  const severity = topSeverity(flags);

  // Upsert via manual check (unique constraint on enrollment_id + type + block_id)
  const existing = await db
    .select()
    .from(enrollmentBlockResponses)
    .where(
      and(
        eq(enrollmentBlockResponses.enrollmentId, input.enrollmentId),
        eq(enrollmentBlockResponses.enrollmentType, input.enrollmentType),
        eq(enrollmentBlockResponses.blockId, input.blockId),
      ),
    )
    .limit(1);

  let row;
  if (existing[0]) {
    const [updated] = await db
      .update(enrollmentBlockResponses)
      .set({
        response: input.response as any,
        completedAt: new Date(),
        safetyFlags: flags as any,
        updatedAt: new Date(),
      })
      .where(eq(enrollmentBlockResponses.id, existing[0].id))
      .returning();
    row = updated;
  } else {
    const [inserted] = await db
      .insert(enrollmentBlockResponses)
      .values({
        enrollmentId: input.enrollmentId,
        enrollmentType: input.enrollmentType,
        blockId: input.blockId,
        blockType,
        response: input.response as any,
        completedAt: new Date(),
        safetyFlags: flags as any,
        reviewedByCounselor: false,
      })
      .returning();
    row = inserted;
  }

  return {
    response: {
      id: row.id,
      enrollmentId: row.enrollmentId,
      enrollmentType: row.enrollmentType,
      blockId: row.blockId,
      blockType: row.blockType,
      response: row.response,
      completedAt: row.completedAt,
      safetyFlags: (row.safetyFlags as SafetyFlag[]) ?? [],
      reviewedByCounselor: row.reviewedByCounselor,
    },
    crisis: severity === 'critical' || severity === 'warning'
      ? { severity, resources: DEFAULT_CRISIS_RESOURCES }
      : null,
  };
}

// ─── Query for counselor ────────────────────────────────────────────

/** List all responses for a given enrollment — used by counselor-side review UI. */
export async function listResponsesForEnrollment(
  enrollmentId: string,
  enrollmentType: EnrollmentType,
) {
  return db
    .select()
    .from(enrollmentBlockResponses)
    .where(
      and(
        eq(enrollmentBlockResponses.enrollmentId, enrollmentId),
        eq(enrollmentBlockResponses.enrollmentType, enrollmentType),
      ),
    )
    .orderBy(desc(enrollmentBlockResponses.completedAt));
}

/** List responses owned by a learner (self-service view). */
export async function listResponsesForUser(
  userId: string,
  enrollmentType: EnrollmentType,
  enrollmentIds: string[],
) {
  if (enrollmentIds.length === 0) return [];
  // Ownership is enforced by the enrollmentIds filter — caller must have validated.
  return db
    .select()
    .from(enrollmentBlockResponses)
    .where(
      and(
        inArray(enrollmentBlockResponses.enrollmentId, enrollmentIds),
        eq(enrollmentBlockResponses.enrollmentType, enrollmentType),
      ),
    );
}

/** Mark a response as reviewed by the counselor. */
export async function markReviewed(responseId: string) {
  const [row] = await db
    .update(enrollmentBlockResponses)
    .set({ reviewedByCounselor: true, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(enrollmentBlockResponses.id, responseId))
    .returning();
  if (!row) throw new NotFoundError('EnrollmentBlockResponse', responseId);
  return row;
}

// ─── Progress aggregation ───────────────────────────────────────────

/**
 * Compute a simple completion percentage for an enrollment given the total
 * block count in the parent course/group.
 */
export async function computeProgress(
  enrollmentId: string,
  enrollmentType: EnrollmentType,
  totalBlocks: number,
): Promise<{ completedBlocks: number; totalBlocks: number; percent: number }> {
  if (totalBlocks === 0) return { completedBlocks: 0, totalBlocks: 0, percent: 0 };
  const rows = await db
    .select({ id: enrollmentBlockResponses.id })
    .from(enrollmentBlockResponses)
    .where(
      and(
        eq(enrollmentBlockResponses.enrollmentId, enrollmentId),
        eq(enrollmentBlockResponses.enrollmentType, enrollmentType),
      ),
    );
  const completedBlocks = rows.length;
  return {
    completedBlocks,
    totalBlocks,
    percent: Math.round((completedBlocks / totalBlocks) * 100),
  };
}

/**
 * Counselor-facing: list responses that have unreviewed safety flags
 * across all enrollments in an org. Joined through courseEnrollments / groupEnrollments
 * to filter by org.
 */
export async function listPendingSafetyFlags(orgId: string) {
  // UNION-style query using drizzle sql tag to stay consistent with delivery.service.ts pattern.
  const courseResult = await db.execute(sql`
    SELECT r.id, r.enrollment_id, r.enrollment_type, r.block_id, r.block_type,
           r.response, r.safety_flags, r.completed_at, ce.user_id
    FROM enrollment_block_responses r
    JOIN course_enrollments ce ON ce.id = r.enrollment_id
    JOIN course_instances ci ON ci.id = ce.instance_id
    WHERE r.enrollment_type = 'course'
      AND r.reviewed_by_counselor = false
      AND jsonb_array_length(r.safety_flags) > 0
      AND ci.org_id = ${orgId}::uuid
    ORDER BY r.completed_at DESC
  `);
  const courseRows: any[] = Array.isArray(courseResult)
    ? (courseResult as any[])
    : ((courseResult as any).rows ?? []);

  const groupResult = await db.execute(sql`
    SELECT r.id, r.enrollment_id, r.enrollment_type, r.block_id, r.block_type,
           r.response, r.safety_flags, r.completed_at, ge.user_id
    FROM enrollment_block_responses r
    JOIN group_enrollments ge ON ge.id = r.enrollment_id
    JOIN group_instances gi ON gi.id = ge.instance_id
    WHERE r.enrollment_type = 'group'
      AND r.reviewed_by_counselor = false
      AND jsonb_array_length(r.safety_flags) > 0
      AND gi.org_id = ${orgId}::uuid
    ORDER BY r.completed_at DESC
  `);
  const groupRows: any[] = Array.isArray(groupResult)
    ? (groupResult as any[])
    : ((groupResult as any).rows ?? []);

  return [...courseRows, ...groupRows];
}
