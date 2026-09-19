import {
  isWorkAttentionAllowedHttpsHost,
  notificationBulkFingerprint,
  type NotificationFeedKind,
  type NotificationPresentationFilter,
} from '@orvilo/types';

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
  kind: NotificationFeedKind,
): string => notificationBulkFingerprint(action, chip, kind);

/** Same-app relative paths navigate in-app; allowlisted https opens a new tab. */
export const inboxUrlOpenMode = (url: string): 'external' | 'internal' | 'reject' => {
  if (url.startsWith('/') && !url.startsWith('//')) return 'internal';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && isWorkAttentionAllowedHttpsHost(parsed.hostname)) {
      return 'external';
    }
  } catch {
    return 'reject';
  }
  return 'reject';
};
