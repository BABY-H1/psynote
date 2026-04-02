import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { groupEnrollments, careTimeline } from '../../db/schema.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';

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

  const [enrollment] = await db.insert(groupEnrollments).values({
    instanceId: input.instanceId,
    userId: input.userId,
    careEpisodeId: input.careEpisodeId || null,
    screeningResultId: input.screeningResultId || null,
    status: 'pending',
  }).returning();

  // Record in care timeline if linked
  if (input.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'group_enrollment',
      refId: enrollment.id,
      title: '报名团辅',
      summary: '已提交团辅报名申请，等待审批',
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

  // Update timeline if linked
  if (updated.careEpisodeId) {
    const statusLabels: Record<string, string> = {
      approved: '团辅报名已通过',
      rejected: '团辅报名被拒绝',
      withdrawn: '已退出团辅',
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
