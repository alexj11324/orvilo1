import {
  classifyWorkAttentionActionUrl,
  notificationBulkFingerprint,
  type NotificationFeedBucket,
  type NotificationFeedCard,
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

/**
 * Linear-style tabs: Priority is anything still needing you (undecided action
 * or unread mention), Other is the rest. The stored row kind stays
 * `action`/`update` — the tab is a priority classification, not a kind alias.
 */
export type InboxTab = 'other' | 'priority';

export const resolveInboxTab = (value: string | null): InboxTab => {
  // Legacy URLs used `action`/`activity`; they map onto the same buckets.
  if (value === 'other' || value === 'activity' || value === 'update') return 'other';
  return 'priority';
};

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
  bucket?: NotificationFeedBucket,
): string => notificationBulkFingerprint(action, chip, bucket);

/** Same-app relative paths navigate in-app; allowlisted https opens a new tab. */
export const inboxUrlOpenMode = (url: string): 'external' | 'internal' | 'reject' =>
  classifyWorkAttentionActionUrl(url).mode;

/**
 * The destination behind a card's "Open" action — `null` when the card either
 * does not offer `open` or its target is not navigable from the inbox (e.g.
 * `kind: 'inbox'` self-references, rejected URLs, or kinds with no client
 * route). The detail pane must not render a dead button for those.
 */
export type InboxOpenTarget =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; to: string }
  | { kind: 'task'; taskId: string };

export const inboxOpenTarget = (
  card: Pick<NotificationFeedCard, 'availableActions' | 'safeNavigation'>,
): InboxOpenTarget | null => {
  if (!card.availableActions.includes('open')) return null;
  const nav = card.safeNavigation;
  if (!nav) return null;
  if (nav.kind === 'task' && nav.taskId) return { kind: 'task', taskId: nav.taskId };
  if (nav.kind === 'project' && nav.projectId) {
    return { kind: 'navigate', to: `/project/${nav.projectId}` };
  }
  if (nav.kind === 'url' && nav.url) {
    const mode = inboxUrlOpenMode(nav.url);
    if (mode === 'internal') return { kind: 'navigate', to: nav.url };
    if (mode === 'external') return { kind: 'external', url: nav.url };
  }
  return null;
};

/**
 * The task a card's open target resolves to. The detail pane mounts the shared
 * issue surface (title, description, properties, activity) only for a routable
 * task target — the same eligibility `inboxOpenTarget` enforces — so a card
 * that cannot open a task never renders one. Non-task targets keep the plain
 * notification card.
 */
export const inboxIssueTaskId = (
  card: Pick<NotificationFeedCard, 'availableActions' | 'safeNavigation'>,
): string | null => {
  const target = inboxOpenTarget(card);
  return target?.kind === 'task' ? target.taskId : null;
};
