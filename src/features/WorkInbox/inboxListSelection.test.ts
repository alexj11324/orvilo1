import { describe, expect, it } from 'vitest';

import {
  armInboxReadReceiptSuppression,
  type InboxReadReceiptRetention,
  nextInboxSelection,
  resolveInboxReadReceiptAttempt,
  resolveInboxReadReceiptRetention,
  retainSelectedInboxCard,
} from './inboxListSelection';
import { INBOX_LIST_HOTKEY_OPTIONS } from './useInboxListKeyboard';

describe('nextInboxSelection', () => {
  it('starts at the first or last row when nothing is selected', () => {
    expect(nextInboxSelection(['a', 'b', 'c'], null, 1)).toBe('a');
    expect(nextInboxSelection(['a', 'b', 'c'], null, -1)).toBe('c');
  });

  it('moves within bounds without wrapping', () => {
    expect(nextInboxSelection(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(nextInboxSelection(['a', 'b', 'c'], 'c', 1)).toBe('c');
    expect(nextInboxSelection(['a', 'b', 'c'], 'a', -1)).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(nextInboxSelection([], 'a', 1)).toBeNull();
  });
});

describe('retainSelectedInboxCard', () => {
  const card = (notificationId: string, read = false) => ({ notificationId, read });

  it('keeps the current server list when the selected card is still present', () => {
    const cards = [card('a'), card('b')];
    const retention = { card: cards[1]!, index: 1, scope: 'workspace-1:priority' };

    expect(retainSelectedInboxCard(cards, card('b', true), retention)).toBe(cards);
  });

  it('re-inserts a selected card at its previous position after it leaves the bucket', () => {
    const selected = card('b', true);
    const retention = { card: card('b'), index: 1, scope: 'workspace-1:priority' };

    expect(retainSelectedInboxCard([card('a'), card('c')], selected, retention)).toEqual([
      card('a'),
      selected,
      card('c'),
    ]);
  });

  it('does not resolve retention across workspace, tab, or filter scopes', () => {
    const retention = { card: card('b'), index: 1, scope: 'workspace-1:priority:all' };

    expect(resolveInboxReadReceiptRetention(retention, 'b', 'workspace-2:priority:all')).toBeNull();
    expect(resolveInboxReadReceiptRetention(retention, 'b', 'workspace-1:other:all')).toBeNull();
    expect(
      resolveInboxReadReceiptRetention(retention, 'b', 'workspace-1:priority:archived'),
    ).toBeNull();
  });

  it('cannot resurrect a retained row after selection departure and return', () => {
    const scope = 'workspace-1:priority:all';
    let retention: InboxReadReceiptRetention<ReturnType<typeof card>> | null = {
      card: card('b'),
      index: 1,
      scope,
    };

    retention = resolveInboxReadReceiptRetention(retention, 'c', scope);

    expect(retention).toBeNull();
    expect(resolveInboxReadReceiptRetention(retention, 'b', scope)).toBeNull();
  });

  it('does not re-insert a removed card without an armed read-receipt retention', () => {
    const cards = [card('a'), card('c')];

    expect(retainSelectedInboxCard(cards, card('b', true), null)).toBe(cards);
  });
});

describe('resolveInboxReadReceiptAttempt', () => {
  it('suppresses repeat reads while selected, then clears on departure before reselect', () => {
    const scope = 'workspace-1:priority:all';
    const attempt = { activityVersion: 4, notificationId: 'a', scope };

    expect(resolveInboxReadReceiptAttempt(attempt, 'a', scope)).toBe(attempt);

    const afterDeparture = resolveInboxReadReceiptAttempt(attempt, null, scope);
    expect(afterDeparture).toBeNull();
    expect(resolveInboxReadReceiptAttempt(afterDeparture, 'a', scope)).toBeNull();
  });

  it('arms suppression when an already-read selected card is explicitly marked unread', () => {
    const scope = 'workspace-1:priority:all';
    const attempt = armInboxReadReceiptSuppression({
      activityVersion: 4,
      notificationId: 'a',
      scope,
      selectedId: 'a',
    });

    expect(resolveInboxReadReceiptAttempt(attempt, 'a', scope)).toEqual({
      activityVersion: 4,
      notificationId: 'a',
      scope,
    });

    const afterDeparture = resolveInboxReadReceiptAttempt(attempt, null, scope);
    expect(resolveInboxReadReceiptAttempt(afterDeparture, 'a', scope)).toBeNull();
  });
});

describe('INBOX_LIST_HOTKEY_OPTIONS', () => {
  it('does not capture J/K inside form fields or contenteditable editors', () => {
    expect(INBOX_LIST_HOTKEY_OPTIONS.enableOnFormTags).toBe(false);
    expect(INBOX_LIST_HOTKEY_OPTIONS.enableOnContentEditable).toBe(false);
  });
});
