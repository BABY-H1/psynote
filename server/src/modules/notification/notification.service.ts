import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications } from '../../db/schema.js';

export async function createNotification(input: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  refType?: string;
  refId?: string;
}) {
  const [notif] = await db.insert(notifications).values(input).returning();
  return notif;
}

export async function listNotifications(
  orgId: string,
  userId: string,
  filters?: { isRead?: boolean },
) {
  const conditions = [
    eq(notifications.orgId, orgId),
    eq(notifications.userId, userId),
  ];
  if (filters?.isRead !== undefined) {
    conditions.push(eq(notifications.isRead, filters.isRead));
  }

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markAsRead(notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId))
    .returning();
  return updated;
}

export async function getUnreadCount(orgId: string, userId: string) {
  const result = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ),
    );
  return result.length;
}
