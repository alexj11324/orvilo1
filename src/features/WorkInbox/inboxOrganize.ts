import {
  classifyWorkAttentionActionUrl,
  notificationBulkFingerprint,
  type NotificationFeedKind,
  type NotificationPresentationFilter,
} from '@orvilo/types';

export const INBOX_FILTER_CHIPS = ['all', 'unread', 'mentions', 'snoozed', 'archived'] as const;

export type InboxFilterChip = (typeof INBOX_FILTER_CHIPS)[number];

export const feedFilterForChip = (
  chip: InboxFilterChip,
): NotificationPresentationFilter | undefined => (chip === 'all' ? undefined : chip);

/** URL params write free-form strings — only known chips survive. */
export const resolveInboxFilterChip = (value: string | null): InboxFilterChip =>
  (INBOX_FILTER_CHIPS as readonly string[]).includes(value ?? '')
    ? (value as InboxFilterChip)
    : 'all';

export type InboxTab = 'action' | 'activity';

export const resolveInboxTab = (value: string | null): InboxTab =>
  value === 'activity' ? 'activity' : 'action';

export const SNOOZE_HOURS = 4;

export const snoozeUntilIso = (now = new Date(), hours = SNOOZE_HOURS): string =>
  new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

/** Linear-style snooze presets — each resolves to an absolute local time so
 *  the choice is unambiguous about the user's own timezone. */
export type InboxSnoozePreset = 'hour' | 'laterToday' | 'tomorrow' | 'nextWeek';

export const INBOX_SNOOZE_PRESETS: InboxSnoozePreset[] = [
  'hour',
  'laterToday',
  'tomorrow',
  'nextWeek',
];

export const snoozeUntilForPreset = (preset: InboxSnoozePreset, now = new Date()): string => {
  const target = new Date(now);
  if (preset === 'hour') return snoozeUntilIso(now, 1);
  if (preset === 'laterToday') {
    // Evening of the same day (18:00 local); if that already passed, next 18:00.
    target.setHours(18, 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.toISOString();
  }
  if (preset === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    return target.toISOString();
  }
  // Next Monday 09:00 local.
  const daysUntilMonday = (8 - target.getDay()) % 7 || 7;
  target.setDate(target.getDate() + daysUntilMonday);
  target.setHours(9, 0, 0, 0);
  return target.toISOString();
};

export const inboxBulkFingerprint = (
  action: 'archive' | 'mark_read',
  chip: InboxFilterChip,
  kind: NotificationFeedKind,
): string => notificationBulkFingerprint(action, chip, kind);

/** Same-app relative paths navigate in-app; allowlisted https opens a new tab. */
export const inboxUrlOpenMode = (url: string): 'external' | 'internal' | 'reject' =>
  classifyWorkAttentionActionUrl(url).mode;
