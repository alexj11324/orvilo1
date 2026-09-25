import { describe, expect, it } from 'vitest';

import { inboxSurface, shouldMarkInboxCardRead } from './inboxSurface';

describe('inboxSurface', () => {
  it('keeps a split preview on a wide screen even before a row is opened', () => {
    expect(inboxSurface(false, false)).toBe('split');
    expect(inboxSurface(false, true)).toBe('split');
  });

  it('stacks list and detail on a narrow screen', () => {
    expect(inboxSurface(true, false)).toBe('list');
    expect(inboxSurface(true, true)).toBe('detail');
  });
});

describe('shouldMarkInboxCardRead', () => {
  it('does not mark a card read just because it appeared in the list', () => {
    expect(shouldMarkInboxCardRead({ cardId: 'a', selectedId: null, surface: 'split' })).toBe(
      false,
    );
    expect(shouldMarkInboxCardRead({ cardId: 'a', selectedId: 'a', surface: 'list' })).toBe(false);
  });

  it('marks the selected card after its preview is actually shown', () => {
    expect(shouldMarkInboxCardRead({ cardId: 'a', selectedId: 'a', surface: 'split' })).toBe(true);
    expect(shouldMarkInboxCardRead({ cardId: 'a', selectedId: 'a', surface: 'detail' })).toBe(true);
  });

  it('does not mark a different card than the one on screen', () => {
    expect(shouldMarkInboxCardRead({ cardId: 'a', selectedId: 'b', surface: 'split' })).toBe(false);
  });
});
