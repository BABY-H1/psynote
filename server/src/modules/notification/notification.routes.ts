import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import * as notificationService from './notification.service.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List my notifications */
  app.get('/', async (request) => {
    const { isRead } = request.query as { isRead?: string };
    return notificationService.listNotifications(
      request.org!.orgId,
      request.user!.id,
      isRead !== undefined ? { isRead: isRead === 'true' } : undefined,
    );
  });

  /** Get unread count */
  app.get('/unread-count', async (request) => {
    const count = await notificationService.getUnreadCount(request.org!.orgId, request.user!.id);
    return { count };
  });

  /** Mark as read */
  app.patch('/:notificationId/read', async (request) => {
    const { notificationId } = request.params as { notificationId: string };
    return notificationService.markAsRead(notificationId);
  });
}
