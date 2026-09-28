import type { NotificationFeedCard } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  appendInboxFeedPage,
  InboxFeedPager,
  inboxFeedScopeKey,
  mergeInboxFeedPages,
} from './inboxFeedPager';

const card = (id: string, activityVersion = 1): NotificationFeedCard =>
  ({
    activityVersion,
    availableActions: ['archive', 'open', 'snooze'],
    content: `Card ${id}`,
    kind: 'update',
    lastActivityAt: '2026-09-18T00:00:00.000Z',
    notificationId: id,
    read: false,
    readVersion: 0,
    title: `Notification ${id}`,
    type: 'task_assigned',
  }) as NotificationFeedCard;

const page = (
  cards: NotificationFeedCard[],
  nextCursor: string | null = null,
  hasMore = false,
) => ({ cards, hasMore, nextCursor });

describe('mergeInboxFeedPages', () => {
  it('drops the tail copy when a notification moved to page 1 with newer activity', () => {
    const merged = mergeInboxFeedPages(
      [card('n1'), card('n60', 2)],
      [card('n59'), card('n60', 1), card('n61')],
    );

    // #60 moved onto page 1 via new activity — emitted once at its new slot,
    // carrying the newer version; the tail copy does not duplicate.
    expect(merged.map((entry) => entry.notificationId)).toEqual(['n1', 'n60', 'n59', 'n61']);
    expect(merged[1]?.activityVersion).toBe(2);
  });

  it('keeps first-page order ahead of the tail', () => {
    const merged = mergeInboxFeedPages([card('n1')], [card('n2'), card('n3')]);
    expect(merged.map((entry) => entry.notificationId)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('appendInboxFeedPage', () => {
  it('dedupes the seam overlap when the cursor row appears on both pages', () => {
    const tail = appendInboxFeedPage(
      { cards: [card('n50', 1)], hasMore: true, nextCursor: 'n50' },
      page([card('n50', 2), card('n51')], 'n51', true),
    );
    expect(tail.cards.map((entry) => entry.notificationId)).toEqual(['n50', 'n51']);
    expect(tail.cards[0]?.activityVersion).toBe(2);
    expect(tail.nextCursor).toBe('n51');
  });
});

describe('InboxFeedPager', () => {
  const scopeA = inboxFeedScopeKey({ kind: 'priority', userId: 'u1', workspaceId: 'ws1' });
  const scopeB = inboxFeedScopeKey({ kind: 'priority', userId: 'u1', workspaceId: 'ws2' });

  it('commits a fetched tail page for the current scope', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);

    await pager.loadMore(scopeA, 'cursor-1', async () => page([card('n51')], 'c2', true));

    expect(pager.tailFor(scopeA)?.cards.map((entry) => entry.notificationId)).toEqual(['n51']);
    expect(pager.tailFor(scopeA)?.nextCursor).toBe('c2');
  });

  it('drops an in-flight page when the workspace switches mid-request', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);

    let resolvePage: (value: ReturnType<typeof page>) => void = () => undefined;
    const pending = pager.loadMore(
      scopeA,
      'cursor-1',
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    // The switch bumps the generation — the late response must NOT land in
    // the new workspace's list.
    pager.setScope(scopeB);
    resolvePage(page([card('n60')], 'c2', true));
    await pending;

    expect(pager.tailFor(scopeB)).toBeNull();
    expect(pager.loadingMore).toBe(false);
  });

  it('masks a not-yet-reset tail from a stale scope', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);
    await pager.loadMore(scopeA, 'cursor-1', async () => page([card('n51')]));

    expect(pager.tailFor(scopeB)).toBeNull();
  });

  it('removes an archived card from the loaded tail immediately', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);
    await pager.loadMore(scopeA, 'cursor-1', async () =>
      page([card('n60'), card('n61')], 'c2', false),
    );

    pager.removeCard('n60');

    expect(pager.tailFor(scopeA)?.cards.map((entry) => entry.notificationId)).toEqual(['n61']);
  });

  it('never re-adds a removed card when a racing page resolves late', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);

    let resolvePage: (value: ReturnType<typeof page>) => void = () => undefined;
    const pending = pager.loadMore(
      scopeA,
      'cursor-1',
      () =>
        new Promise<ReturnType<typeof page>>((resolve) => {
          resolvePage = resolve;
        }),
    );
    pager.removeCard('n60');
    resolvePage(page([card('n60'), card('n61')], 'c2', true));
    await pending;

    expect(pager.tailFor(scopeA)?.cards.map((entry) => entry.notificationId)).toEqual(['n61']);
  });

  it('keeps the cursor on a failed fetch so retry re-issues the same page', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);

    await pager.loadMore(scopeA, 'cursor-1', async () => {
      throw new Error('offline');
    });

    expect(pager.tailFor(scopeA)).toBeNull();
    expect(pager.loadMoreError).toBeInstanceOf(Error);
    expect(pager.loadingMore).toBe(false);

    await pager.loadMore(scopeA, 'cursor-1', async () => page([card('n51')], 'c2', false));
    expect(pager.tailFor(scopeA)?.cards.map((entry) => entry.notificationId)).toEqual(['n51']);
    expect(pager.loadMoreError).toBeNull();
  });

  it('reset drops an in-flight commit', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);

    let resolvePage: (value: ReturnType<typeof page>) => void = () => undefined;
    const pending = pager.loadMore(
      scopeA,
      'cursor-1',
      () =>
        new Promise<ReturnType<typeof page>>((resolve) => {
          resolvePage = resolve;
        }),
    );
    pager.reset();
    resolvePage(page([card('n60')]));
    await pending;

    expect(pager.tailFor(scopeA)).toBeNull();
  });

  it('updateCard patches the tail copy in place', async () => {
    const pager = new InboxFeedPager();
    pager.setScope(scopeA);
    await pager.loadMore(scopeA, 'cursor-1', async () => page([card('n51')]));

    pager.updateCard('n51', (entry) => ({ ...entry, read: true }));

    expect(pager.tailFor(scopeA)?.cards[0]?.read).toBe(true);
  });
});
