import { lambdaClient } from '@/libs/trpc/client';

class NotificationService {
  list = (
    params: {
      category?: string;
      cursor?: string;
      includeSnoozed?: boolean;
      isRead?: boolean;
      limit?: number;
      unreadOnly?: boolean;
    } = {},
  ) => {
    return lambdaClient.notification.list.query(params);
  };

  getNavigationCounts = () => {
    return lambdaClient.notification.navigationCounts.query();
  };

  getUnreadCount = (): Promise<number> => {
    return lambdaClient.notification.unreadCount.query();
  };

  markAsRead = (ids: string[]) => {
    return lambdaClient.notification.markAsRead.mutate({ ids });
  };

  markReadObserved = (id: string, observedVersion: number) => {
    return lambdaClient.notification.markReadObserved.mutate({ id, observedVersion });
  };

  markUnread = (id: string, expectedVersion: number) => {
    return lambdaClient.notification.markUnread.mutate({ expectedVersion, id });
  };

  snooze = (id: string, until: string, expectedVersion: number) => {
    return lambdaClient.notification.snooze.mutate({ expectedVersion, id, until });
  };

  feed = (
    params: {
      cursor?: string;
      filter?: 'all' | 'archived' | 'mentions' | 'snoozed' | 'unread';
      includeSnoozed?: boolean;
      kind?: 'action' | 'other' | 'priority' | 'update';
      limit?: number;
    } = {},
  ) => {
    return lambdaClient.notification.feed.query(params);
  };

  feedCard = (id: string) => {
    return lambdaClient.notification.feedCard.query({ id });
  };

  feedSummary = () => {
    return lambdaClient.notification.feedSummary.query();
  };

  markAllAsRead = () => {
    return lambdaClient.notification.markAllAsRead.mutate();
  };

  archive = (id: string, expectedVersion?: number) => {
    return lambdaClient.notification.archive.mutate({ expectedVersion, id });
  };

  archiveAll = () => {
    return lambdaClient.notification.archiveAll.mutate();
  };

  prepareBulk = (input: { action: 'archive' | 'mark_read'; queryFingerprint: string }) => {
    return lambdaClient.notification.prepareBulk.mutate(input);
  };

  applyBulk = (token: string) => {
    return lambdaClient.notification.applyBulk.mutate({ token });
  };
}

export const notificationService = new NotificationService();
