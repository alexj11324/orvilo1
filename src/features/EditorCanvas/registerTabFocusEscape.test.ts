import { describe, expect, it } from 'vitest';

import { tabLeavesEditor } from './registerTabFocusEscape';

const keys = (overrides: Partial<KeyboardEvent> = {}) => ({
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...overrides,
});

describe('tabLeavesEditor', () => {
  it('lets Tab and Shift+Tab move focus out of a plain paragraph', () => {
    expect(tabLeavesEditor(keys(), false)).toBe(true);
  });

  it('keeps Tab as indent inside a list item', () => {
    expect(tabLeavesEditor(keys(), true)).toBe(false);
  });

  it('leaves modified Tab to the browser / OS', () => {
    expect(tabLeavesEditor(keys({ ctrlKey: true }), false)).toBe(false);
    expect(tabLeavesEditor(keys({ altKey: true }), false)).toBe(false);
    expect(tabLeavesEditor(keys({ metaKey: true }), false)).toBe(false);
  });
});
