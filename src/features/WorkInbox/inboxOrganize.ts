import {
  classifyWorkAttentionActionUrl,
  type NotificationFeedCard,
  type NotificationFeedTypeFilter,
} from '@orvilo/types';

/**
 * Plane's inbox tabs: `all` is every non-mention row (the server excludes
 * mentions from it), `mentions` is mention rows only — the tab is a request
 * parameter (`mentioned`), not a presentation filter.
 */
export const INBOX_TABS = ['all', 'mentions'] as const;

export type InboxTab = (typeof INBOX_TABS)[number];

export const resolveInboxTab = (value: string | null): InboxTab =>
  value === 'mentions' ? 'mentions' : 'all';

/**
 * Plane's ⋮ display options. One base view at a time — `archived` and
 * `snoozed` share the `filter` param so checking one unchecks the other;
 * `unread` can additionally stack on top of either via the `unread` flag.
 */
export const INBOX_DISPLAY_OPTIONS = ['unread', 'archived', 'snoozed'] as const;

export type InboxDisplayOption = (typeof INBOX_DISPLAY_OPTIONS)[number];

export const resolveInboxDisplayOption = (value: string | null): InboxDisplayOption | undefined =>
  (INBOX_DISPLAY_OPTIONS as readonly string[]).includes(value ?? '')
    ? (value as InboxDisplayOption)
    : undefined;

/**
 * Plane's funnel filters — OR'd task-resource relationships on the server.
 */
export const INBOX_TYPE_FILTERS = ['assigned', 'created', 'subscribed'] as const;

export type InboxTypeFilter = NotificationFeedTypeFilter;

/** URL params write free-form strings — only known filters survive. */
export const resolveInboxTypeFilters = (value: string | null): InboxTypeFilter[] =>
  (value ?? '')
    .split(',')
    .filter((item): item is InboxTypeFilter =>
      (INBOX_TYPE_FILTERS as readonly string[]).includes(item),
    );

export const serializeInboxTypeFilters = (filters: readonly InboxTypeFilter[]): string =>
  INBOX_TYPE_FILTERS.filter((filter) => filters.includes(filter)).join(',');

/**
 * Plane's snooze presets — a fixed number of days, plus a Custom date+time
 * picked through the modal. Each resolves to an absolute moment against the
 * user's local time.
 */
export const INBOX_SNOOZE_DAYS = [1, 3, 5, 7, 14] as const;

export type InboxSnoozeDays = (typeof INBOX_SNOOZE_DAYS)[number];

export const snoozeUntilForDays = (days: InboxSnoozeDays, now = new Date()): string =>
  new Date(now.getTime() + days * 86_400_000).toISOString();

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
