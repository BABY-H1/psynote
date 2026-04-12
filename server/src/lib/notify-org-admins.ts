/**
 * Utility to notify all active org_admin users in an organization.
 *
 * Used when counselors create "project-level" content (group instances,
 * course instances, assessment batches) so admins stay informed about
 * counselor activity without having to poll.
 */
import { db } from '../config/database.js';
import { orgMembers, notifications } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

interface AdminNotification {
  type: string;
  title: string;
  body?: string;
  refType?: string;
  refId?: string;
}

export async function notifyOrgAdmins(
  orgId: string,
  notification: AdminNotification,
): Promise<void> {
  try {
    // Find all active org_admin users in this org
    const admins = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, 'org_admin'),
        eq(orgMembers.status, 'active'),
      ));

    if (admins.length === 0) return;

    // Batch insert notifications for all admins
    await db.insert(notifications).values(
      admins.map((admin) => ({
        orgId,
        userId: admin.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body ?? null,
        refType: notification.refType ?? null,
        refId: notification.refId ?? null,
      })),
    );
  } catch (err) {
    // Non-critical — log but don't throw to avoid breaking the main operation
    console.error('[notifyOrgAdmins] Failed to send admin notifications:', err);
  }
}
