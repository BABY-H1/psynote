export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  refType?: string;
  refId?: string;
  isRead: boolean;
  createdAt: string;
}
