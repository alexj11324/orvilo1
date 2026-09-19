import { describe, expect, it } from 'vitest';

import { nextInboxSelection } from './inboxListSelection';
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

describe('INBOX_LIST_HOTKEY_OPTIONS', () => {
  it('does not capture J/K inside form fields or contenteditable editors', () => {
    expect(INBOX_LIST_HOTKEY_OPTIONS.enableOnFormTags).toBe(false);
    expect(INBOX_LIST_HOTKEY_OPTIONS.enableOnContentEditable).toBe(false);
  });
});
