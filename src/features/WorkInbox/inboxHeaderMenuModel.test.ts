import { describe, expect, it } from 'vitest';

import { INBOX_HEADER_MENU, type InboxHeaderMenuEntry } from './inboxHeaderMenuModel';

const itemKeys = (entries: readonly InboxHeaderMenuEntry[]) =>
  entries.filter((entry) => entry.type === 'item').map((entry) => entry.key);

describe('INBOX_HEADER_MENU', () => {
  it('mirrors the reference order: mark-all-read, divider, delete group, divider, settings', () => {
    expect(INBOX_HEADER_MENU.map((entry) => (entry.type === 'divider' ? '—' : entry.key))).toEqual([
      'markAllRead',
      '—',
      'deleteAll',
      '—',
      'goToSettings',
    ]);
  });

  it('keeps only entries the backend can actually serve', () => {
    // Reference "Delete all read" has no `read` bulk fingerprint and
    // "Delete all completed" has no completed-state concept — both stay out
    // rather than rendering dead items.
    expect(itemKeys(INBOX_HEADER_MENU)).toEqual(['markAllRead', 'deleteAll', 'goToSettings']);
    expect(itemKeys(INBOX_HEADER_MENU)).not.toContain('deleteAllRead');
    expect(itemKeys(INBOX_HEADER_MENU)).not.toContain('deleteAllCompleted');
  });

  it('gives every item an icon and a notification-namespace label', () => {
    for (const entry of INBOX_HEADER_MENU) {
      if (entry.type !== 'item') continue;
      expect(entry.icon).toBeTruthy();
      expect(entry.labelKey).toMatch(/^inbox\./);
    }
  });

  it('shows the ⌥U hint on mark-all-read only — the page binds it for real', () => {
    const shortcuts = INBOX_HEADER_MENU.filter(
      (entry): entry is Extract<InboxHeaderMenuEntry, { type: 'item' }> => entry.type === 'item',
    ).map((entry) => [entry.key, entry.shortcut]);
    expect(shortcuts).toEqual([
      ['markAllRead', '⌥U'],
      ['deleteAll', undefined],
      ['goToSettings', undefined],
    ]);
  });
});
