import { eq, and, asc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database.js';
import { groupEnrollments, groupInstances, careTimeline, users, orgMembers } from '../../db/schema.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';

/**
 * Find an existing user by email, or create a new one and add them to the org.
 * Used by batch enrollment and CSV import flows.
 */
export async function findOrCreateUserByEmail(input: {
  email: string;
  name?: string;
  phone?: string;
  orgId: string;
}): Promise<{ id: string }> {
  // Try to find existing user by email
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) {
    // Ensure they're an org member
    const [membership] = await db
      .select()
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, existing.id),
      ))
      .limit(1);

    if (!membership) {
      await db.insert(orgMembers).values({
        orgId: input.orgId,
        userId: existing.id,
        role: 'client',
      });
    }
    return existing;
  }

  // Create new user
  const [newUser] = await db.insert(users).values({
    id: randomUUID(),
    email: input.email,
    name: input.name || input.email.split('@')[0],
  }).returning();

  // Add to org as client
  await db.insert(orgMembers).values({
    orgId: input.orgId,
    userId: newUser.id,
    role: 'client',
  });

  return newUser;
}

export async function enroll(input: {
  instanceId: string;
  userId: string;
  careEpisodeId?: string;
  screeningResultId?: string;
}) {
  // Check for duplicate enrollment
  const [existing] = await db
    .select()
    .from(groupEnrollments)
    .where(and(
      eq(groupEnrollments.instanceId, input.instanceId),
      eq(groupEnrollments.userId, input.userId),
    ))
    .limit(1);

  if (existing) throw new ConflictError('User is already enrolled in this group');

  // Check capacity for waitlist logic
  let initialStatus = 'pending';
  const [instance] = await db
    .select()
    .from(groupInstances)
    .where(eq(groupInstances.id, input.instanceId))
    .limit(1);

  if (instance?.capacity) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(groupEnrollments)
      .where(and(
        eq(groupEnrollments.instanceId, input.instanceId),
        eq(groupEnrollments.status, 'approved'),
      ));

    if (Number(countResult.count) >= instance.capacity) {
      initialStatus = 'waitlisted';
    }
  }

  const [enrollment] = await db.insert(groupEnrollments).values({
    instanceId: input.instanceId,
    userId: input.userId,
    careEpisodeId: input.careEpisodeId || null,
    screeningResultId: input.screeningResultId || null,
    status: initialStatus,
  }).returning();

  // Record in care timeline if linked
  if (input.careEpisodeId) {
    const summary = initialStatus === 'waitlisted'
      ? '已加入团辅等候列表'
      : '已提交团辅报名申请，等待审批';
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'group_enrollment',
      refId: enrollment.id,
      title: initialStatus === 'waitlisted' ? '加入团辅等候' : '报名团辅',
      summary,
      createdBy: input.userId,
    });
  }

  return enrollment;
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: string,
  approvedBy?: string,
) {
  const updates: Record<string, unknown> = { status };
  if (status === 'approved') {
    updates.enrolledAt = new Date();
  }

  const [updated] = await db
    .update(groupEnrollments)
    .set(updates)
    .where(eq(groupEnrollments.id, enrollmentId))
    .returning();

  if (!updated) throw new NotFoundError('GroupEnrollment', enrollmentId);

  // Auto-promote waitlisted members when someone withdraws or is rejected
  if (status === 'withdrawn' || status === 'rejected') {
    await autoPromoteWaitlist(updated.instanceId);
  }

  // Update timeline if linked
  if (updated.careEpisodeId) {
    const statusLabels: Record<string, string> = {
      approved: '团辅报名已通过',
      rejected: '团辅报名被拒绝',
      withdrawn: '已退出团辅',
      waitlisted: '已加入团辅等候列表',
    };
    await db.insert(careTimeline).values({
      careEpisodeId: updated.careEpisodeId,
      eventType: 'group_enrollment',
      refId: updated.id,
      title: statusLabels[status] || `团辅报名状态: ${status}`,
      createdBy: approvedBy || null,
    });
  }

  return updated;
}

/**
 * Auto-promote the earliest waitlisted member to pending when capacity opens up.
 */
async function autoPromoteWaitlist(instanceId: string) {
  // Check if there's room
  const [instance] = await db
    .select()
    .from(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .limit(1);

  if (!instance?.capacity) return;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(groupEnrollments)
    .where(and(
      eq(groupEnrollments.instanceId, instanceId),
      eq(groupEnrollments.status, 'approved'),
    ));

  if (Number(countResult.count) >= instance.capacity) return;

  // Find earliest waitlisted member
  const [nextWaitlisted] = await db
    .select()
    .from(groupEnrollments)
    .where(and(
      eq(groupEnrollments.instanceId, instanceId),
      eq(groupEnrollments.status, 'waitlisted'),
    ))
    .orderBy(asc(groupEnrollments.createdAt))
    .limit(1);

  if (nextWaitlisted) {
    await db
      .update(groupEnrollments)
      .set({ status: 'pending' })
      .where(eq(groupEnrollments.id, nextWaitlisted.id));

    // Timeline update if linked
    if (nextWaitlisted.careEpisodeId) {
      await db.insert(careTimeline).values({
        careEpisodeId: nextWaitlisted.careEpisodeId,
        eventType: 'group_enrollment',
        refId: nextWaitlisted.id,
        title: '团辅等候递补',
        summary: '有名额空出，已从等候列表转为待审批',
      });
    }
  }
}
