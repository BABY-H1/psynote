import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { groupInstances, groupEnrollments, groupSchemeSessions, groupSessionRecords, users, followUpPlans, notifications } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import { notifyOrgAdmins } from '../../lib/notify-org-admins.js';

export async function listInstances(orgId: string, status?: string, leaderId?: string, leaderIds?: string[]) {
  const conditions = [eq(groupInstances.orgId, orgId)];
  if (status) conditions.push(eq(groupInstances.status, status));
  if (leaderId) conditions.push(eq(groupInstances.leaderId, leaderId));
  if (leaderIds && leaderIds.length > 0) conditions.push(inArray(groupInstances.leaderId, leaderIds));

  return db
    .select()
    .from(groupInstances)
    .where(and(...conditions))
    .orderBy(desc(groupInstances.createdAt));
}

export async function getInstanceById(instanceId: string) {
  const [instance] = await db
    .select()
    .from(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .limit(1);

  if (!instance) throw new NotFoundError('GroupInstance', instanceId);

  // Get enrollments with user info
  const enrollments = await db
    .select({
      enrollment: groupEnrollments,
      userName: users.name,
      userEmail: users.email,
    })
    .from(groupEnrollments)
    .leftJoin(users, eq(users.id, groupEnrollments.userId))
    .where(eq(groupEnrollments.instanceId, instanceId));

  return {
    ...instance,
    enrollments: enrollments.map((e) => ({
      ...e.enrollment,
      user: { name: e.userName, email: e.userEmail },
    })),
  };
}

export async function createInstance(input: {
  orgId: string;
  schemeId?: string;
  title: string;
  description?: string;
  category?: string;
  leaderId?: string;
  schedule?: string;
  duration?: string;
  startDate?: string;
  location?: string;
  status?: string;
  capacity?: number;
  recruitmentAssessments?: string[];
  overallAssessments?: string[];
  screeningNotes?: string;
  assessmentConfig?: object;
  createdBy: string;
}) {
  const [instance] = await db.insert(groupInstances).values({
    orgId: input.orgId,
    schemeId: input.schemeId || null,
    title: input.title,
    description: input.description,
    category: input.category,
    leaderId: input.leaderId || input.createdBy,
    schedule: input.schedule,
    duration: input.duration,
    startDate: input.startDate,
    location: input.location,
    status: input.status || 'draft',
    capacity: input.capacity,
    recruitmentAssessments: input.recruitmentAssessments || [],
    overallAssessments: input.overallAssessments || [],
    screeningNotes: input.screeningNotes,
    assessmentConfig: input.assessmentConfig || {},
    createdBy: input.createdBy,
  }).returning();

  // Auto-generate session records from scheme if linked
  if (input.schemeId) {
    const schemeSessions = await db
      .select()
      .from(groupSchemeSessions)
      .where(eq(groupSchemeSessions.schemeId, input.schemeId))
      .orderBy(asc(groupSchemeSessions.sortOrder));

    if (schemeSessions.length > 0) {
      await db.insert(groupSessionRecords).values(
        schemeSessions.map((ss, idx) => ({
          instanceId: instance.id,
          schemeSessionId: ss.id,
          sessionNumber: idx + 1,
          title: ss.title,
          status: 'planned',
        })),
      );
    }
  }

  // Notify org admins about the new group instance
  notifyOrgAdmins(input.orgId, {
    type: 'counselor_content_created',
    title: `新团辅活动「${input.title}」已创建`,
    refType: 'group_instance',
    refId: instance.id,
  });

  return instance;
}

export async function updateInstance(
  instanceId: string,
  updates: Partial<{
    title: string;
    description: string;
    category: string;
    leaderId: string;
    schedule: string;
    duration: string;
    startDate: string;
    location: string;
    status: string;
    capacity: number;
    recruitmentAssessments: string[];
    overallAssessments: string[];
    screeningNotes: string;
    assessmentConfig: object;
  }>,
) {
  const [updated] = await db
    .update(groupInstances)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(groupInstances.id, instanceId))
    .returning();

  if (!updated) throw new NotFoundError('GroupInstance', instanceId);

  // Auto-create follow-up plans when group ends
  if (updates.status === 'ended' || updates.status === 'archived') {
    createFollowUpPlansForInstance(instanceId).catch(() => {});
  }

  return updated;
}

/**
 * When a group instance ends, create follow-up plans based on assessmentConfig.followUp.
 * Creates a notification + follow-up plan for each enrolled member × each follow-up round.
 */
async function createFollowUpPlansForInstance(instanceId: string) {
  const [instance] = await db.select().from(groupInstances).where(eq(groupInstances.id, instanceId)).limit(1);
  if (!instance) return;

  const config = (instance.assessmentConfig || {}) as Record<string, unknown>;
  const followUpRounds = (config.followUp || []) as Array<{ assessments: string[]; delayDays: number; label?: string }>;
  if (followUpRounds.length === 0) return;

  // Get approved enrollments
  const enrollments = await db
    .select({ id: groupEnrollments.id, userId: groupEnrollments.userId, careEpisodeId: groupEnrollments.careEpisodeId })
    .from(groupEnrollments)
    .where(and(eq(groupEnrollments.instanceId, instanceId), eq(groupEnrollments.status, 'approved')));

  if (enrollments.length === 0) return;

  const now = new Date();

  for (const round of followUpRounds) {
    const dueDate = new Date(now.getTime() + round.delayDays * 86400000);

    for (const enrollment of enrollments) {
      // Create follow-up plan (requires careEpisodeId — skip if not linked)
      if (enrollment.careEpisodeId && round.assessments?.[0]) {
        try {
          await db.insert(followUpPlans).values({
            orgId: instance.orgId,
            careEpisodeId: enrollment.careEpisodeId,
            counselorId: instance.leaderId || instance.createdBy!,
            planType: 'group_followup',
            assessmentId: round.assessments[0],
            frequency: `once_after_${round.delayDays}d`,
            nextDue: dueDate,
            notes: `${instance.title} - ${round.label || `${round.delayDays}天随访`}`,
          });
        } catch { /* duplicate or FK error — skip */ }
      }

      // Always create notification for the client
      try {
        await db.insert(notifications).values({
          orgId: instance.orgId,
          userId: enrollment.userId,
          type: 'followup_scheduled',
          title: `${round.label || '随访评估'} 已安排`,
          body: `"${instance.title}" 的随访评估将于 ${dueDate.toLocaleDateString('zh-CN')} 开始，届时请完成量表填写。`,
          refType: 'group_instance',
          refId: instanceId,
        });
      } catch { /* skip */ }
    }
  }
}

export async function deleteInstance(instanceId: string) {
  const [deleted] = await db
    .delete(groupInstances)
    .where(eq(groupInstances.id, instanceId))
    .returning();

  if (!deleted) throw new NotFoundError('GroupInstance', instanceId);
  return deleted;
}
