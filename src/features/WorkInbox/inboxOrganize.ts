import type { NotificationPresentationFilter } from '@orvilo/types';

export const INBOX_FILTER_CHIPS = ['all', 'unread', 'mentions', 'snoozed', 'archived'] as const;

export type InboxFilterChip = (typeof INBOX_FILTER_CHIPS)[number];

export const feedFilterForChip = (
  chip: InboxFilterChip,
): NotificationPresentationFilter | undefined => (chip === 'all' ? undefined : chip);

export const SNOOZE_HOURS = 4;

export const snoozeUntilIso = (now = new Date(), hours = SNOOZE_HOURS): string =>
  new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

export const inboxBulkFingerprint = (
  action: 'archive' | 'mark_read',
  chip: InboxFilterChip,
): string => `${action}:${chip}`;
