import type { NotificationFeedBucket } from '@orvilo/types';

/**
 * Priority-inbox onboarding + per-workspace mode.
 *
 * Linear shows "Important notifications now go to your priority inbox" with a
 * Keep / Disable choice. There is no server field for the preference, so the
 * choice persists locally in SystemStatus (`inboxPriorityMode`), keyed by
 * user + workspace — disabling the priority tabs in one workspace must never
 * collapse the inbox in another (or leak across accounts on a shared device).
 */
export type InboxPriorityMode = 'all' | 'priority';

export const inboxPriorityScopeKey = (scope: {
  userId?: string;
  workspaceId: string | null;
}): string => `${scope.userId ?? 'anonymous'}:${scope.workspaceId ?? 'personal'}`;

export interface InboxPriorityState {
  /** Undecided scopes see the onboarding banner once; a choice dismisses it. */
  bannerVisible: boolean;
  /** 'all' collapses Priority/Other into one unified list (Linear's Disable). */
  priorityEnabled: boolean;
}

export const resolveInboxPriority = (mode: InboxPriorityMode | undefined): InboxPriorityState => ({
  bannerVisible: mode === undefined,
  priorityEnabled: mode !== 'all',
});

/**
 * Feed `kind` for the query. Unified mode passes no bucket so the server
 * returns every row — the priority classification is client-side only.
 */
export const inboxFeedKind = (
  priorityEnabled: boolean,
  tab: 'other' | 'priority',
): NotificationFeedBucket | undefined => (priorityEnabled ? tab : undefined);

/**
 * Pager identity token for the active query — must differ per logical feed so
 * a tail page fetched under the tabbed query can never commit into the
 * unified one (and vice versa).
 */
export const inboxScopeKindToken = (priorityEnabled: boolean, tab: string): string =>
  priorityEnabled ? tab : 'all';
