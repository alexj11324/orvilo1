import type { NotificationFeedCard, NotificationFeedPage } from '@orvilo/types';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

/**
 * Cursor-paginated feed tail bound to a request identity.
 *
 * The first page is owned by SWR; every later page lives here. A tail page is
 * only ever written back when the request that produced it still belongs to
 * the *current* identity — `user + workspace + query fingerprint` — and the
 * same generation. Switching scope or resetting the tail bumps the generation,
 * so a late response from the old context is dropped at commit time. Clearing
 * state never cancels an in-flight promise; the guard lives at write-back.
 *
 * Reusable by any keyset-paginated list with `{cards, hasMore, nextCursor}`
 * pages and id+versioned rows (e.g. a notifications feed).
 */
export interface InboxFeedScope {
  filter?: string;
  kind: string;
  userId?: string;
  workspaceId: string | null;
}

/** Identity of one logical feed request — user, scope and query fingerprint. */
export const inboxFeedScopeKey = (scope: InboxFeedScope): string =>
  JSON.stringify([
    scope.userId ?? 'anonymous',
    scope.workspaceId ?? 'personal',
    scope.kind,
    scope.filter ?? 'all',
  ]);

export interface InboxFeedTail {
  cards: NotificationFeedCard[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** When the same notification appears twice, the newer snapshot wins. */
const preferNewer = (a: NotificationFeedCard, b: NotificationFeedCard): NotificationFeedCard =>
  b.activityVersion > a.activityVersion ? b : a;

/**
 * Merge the refetched first page with the loaded tail. A notification that
 * moved onto page one via new activity is emitted once, at its new first-page
 * position, carrying the newest `activityVersion` seen — the tail copy is
 * dropped instead of duplicating the row.
 */
export const mergeInboxFeedPages = (
  firstPage: NotificationFeedCard[],
  tail: NotificationFeedCard[],
): NotificationFeedCard[] => {
  const byId = new Map<string, NotificationFeedCard>();
  const order: string[] = [];
  for (const card of [...firstPage, ...tail]) {
    const previous = byId.get(card.notificationId);
    if (previous === undefined) order.push(card.notificationId);
    byId.set(card.notificationId, previous === undefined ? card : preferNewer(previous, card));
  }
  return order.map((id) => byId.get(id)!);
};

/** Append one fetched page to the tail, deduping the seam overlap by id+version. */
export const appendInboxFeedPage = (
  tail: InboxFeedTail | null,
  page: Pick<NotificationFeedPage, 'cards' | 'hasMore' | 'nextCursor'>,
  excludeIds?: ReadonlySet<string>,
): InboxFeedTail => ({
  cards: mergeInboxFeedPages(
    tail?.cards ?? [],
    excludeIds ? page.cards.filter((card) => !excludeIds.has(card.notificationId)) : page.cards,
  ),
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
});

interface InboxFeedPageToken {
  generation: number;
  scope: string;
}

export class InboxFeedPager {
  #generation = 0;
  #loadMoreError: unknown = null;
  #loadingMore = false;
  // Ids removed by an organizing mutation while a page fetch may still be in
  // flight — an in-flight response must not re-add a card the user archived.
  #removedIds = new Set<string>();
  #scope = '';
  #tail: InboxFeedTail | null = null;
  #version = 0;
  #listeners = new Set<() => void>();

  get loadMoreError(): unknown {
    return this.#loadMoreError;
  }

  get loadingMore(): boolean {
    return this.#loadingMore;
  }

  /** Monotonic snapshot for `useSyncExternalStore` — bumps on every write. */
  get version(): number {
    return this.#version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #emit = () => {
    this.#version += 1;
    for (const listener of this.#listeners) listener();
  };

  /**
   * Rebind the pager to a new request identity. Bumps the generation so any
   * in-flight page fetch from the previous identity can never commit — and the
   * stale tail is dropped in the same turn.
   */
  setScope = (scope: string): void => {
    if (scope === this.#scope) return;
    this.#scope = scope;
    this.#generation += 1;
    this.#tail = null;
    this.#removedIds.clear();
    this.#loadMoreError = null;
    this.#loadingMore = false;
    this.#emit();
  };

  /**
   * The tail only exists while its scope is current — a caller always reads
   * through `tailFor(currentScope)` so a not-yet-reset stale tail stays hidden
   * even before the scope-change effect runs.
   */
  tailFor = (scope: string): InboxFeedTail | null => (scope === this.#scope ? this.#tail : null);

  #isCurrent = (token: InboxFeedPageToken): boolean =>
    token.scope === this.#scope && token.generation === this.#generation;

  /**
   * Fetch the next page. `firstNextCursor` is page one's cursor, used when no
   * tail exists yet. The response commits only when the captured identity is
   * still current — a stale promise resolves into a dropped write.
   */
  loadMore = async (
    scope: string,
    firstNextCursor: string | null,
    fetchPage: (
      cursor: string,
    ) => Promise<Pick<NotificationFeedPage, 'cards' | 'hasMore' | 'nextCursor'>>,
  ): Promise<void> => {
    const cursor = this.#tail ? this.#tail.nextCursor : firstNextCursor;
    if (!cursor || this.#loadingMore) return;
    const token: InboxFeedPageToken = { generation: this.#generation, scope };
    this.#loadingMore = true;
    this.#loadMoreError = null;
    this.#emit();
    try {
      const page = await fetchPage(cursor);
      if (!this.#isCurrent(token)) return;
      this.#tail = appendInboxFeedPage(this.#tail, page, this.#removedIds);
    } catch (error) {
      if (!this.#isCurrent(token)) return;
      // The failed page is not persisted — the cursor stays put so the
      // visible Retry re-issues the same page instead of skipping rows.
      this.#loadMoreError = error;
    } finally {
      if (this.#isCurrent(token)) this.#loadingMore = false;
      this.#emit();
    }
  };

  /** Drop one notification from the loaded tail (e.g. it was just archived). */
  removeCard = (notificationId: string): void => {
    this.#removedIds.add(notificationId);
    if (!this.#tail?.cards.some((card) => card.notificationId === notificationId)) return;
    this.#tail = {
      ...this.#tail,
      cards: this.#tail.cards.filter((card) => card.notificationId !== notificationId),
    };
    this.#emit();
  };

  /** Patch one tail card in place after an organizing mutation landed. */
  updateCard = (
    notificationId: string,
    update: (card: NotificationFeedCard) => NotificationFeedCard,
  ): void => {
    if (!this.#tail?.cards.some((card) => card.notificationId === notificationId)) return;
    this.#tail = {
      ...this.#tail,
      cards: this.#tail.cards.map((card) =>
        card.notificationId === notificationId ? update(card) : card,
      ),
    };
    this.#emit();
  };

  /**
   * Forget every loaded tail page (bulk organize mutates the whole set, so a
   * fetched tail can no longer be trusted). Also bumps the generation — an
   * in-flight `loadMore` for the wiped tail is dropped at commit.
   */
  reset = (): void => {
    this.#generation += 1;
    this.#tail = null;
    this.#removedIds.clear();
    this.#loadMoreError = null;
    this.#loadingMore = false;
    this.#emit();
  };
}

/**
 * React binding: one pager per mounted page; `useSyncExternalStore` re-renders
 * on every committed tail write. `setScope` rebinds on identity change.
 */
export const useInboxFeedPager = (scope: string): InboxFeedPager => {
  const pager = useSingleton(() => new InboxFeedPager());
  useSyncExternalStore(
    useCallback((onStoreChange) => pager.subscribe(onStoreChange), [pager]),
    useCallback(() => pager.version, [pager]),
  );
  useEffect(() => {
    pager.setScope(scope);
  }, [pager, scope]);
  return pager;
};
