import {
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

const ALLOWED_HTTPS_HOSTS = ['github.com', 'linear.app'] as const;

const isAllowedHttpsHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return ALLOWED_HTTPS_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

/** Same-app relative paths navigate in-app; allowlisted https opens a new tab. */
export const inboxUrlOpenMode = (url: string): 'external' | 'internal' | 'reject' => {
  if (url.startsWith('/') && !url.startsWith('//')) return 'internal';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && isAllowedHttpsHost(parsed.hostname)) return 'external';
  } catch {
    return 'reject';
  }
  return 'reject';
};
