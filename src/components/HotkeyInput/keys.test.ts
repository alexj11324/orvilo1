import { describe, expect, it } from 'vitest';

import { isSameHotkey, normalizeRecordedKeys, splitHotkey } from './keys';

describe('splitHotkey', () => {
  it('orders modifiers before regular keys and maps `++` to the plus key', () => {
    expect(splitHotkey('k+shift+mod')).toEqual(['mod', 'shift', 'k']);
    expect(splitHotkey('mod++')).toEqual(['mod', 'equal']);
  });
});

describe('isSameHotkey', () => {
  it('compares combinations regardless of order', () => {
    expect(isSameHotkey('shift+mod+k', 'mod+shift+k')).toBe(true);
    expect(isSameHotkey('mod+k', 'mod+shift+k')).toBe(false);
  });
});

describe('normalizeRecordedKeys', () => {
  it('folds the platform command key into `mod`', () => {
    expect(normalizeRecordedKeys(['meta', 'k'], true)).toEqual({
      isValid: true,
      keys: ['mod', 'k'],
    });
    expect(normalizeRecordedKeys(['ctrl', 'k'], false)).toEqual({
      isValid: true,
      keys: ['mod', 'k'],
    });
  });

  it('keeps only the last regular key', () => {
    expect(normalizeRecordedKeys(['shift', 'a', 'b'], false).keys).toEqual(['shift', 'b']);
  });

  it('rejects combinations without a modifier or a regular key', () => {
    expect(normalizeRecordedKeys(['k'], false).isValid).toBe(false);
    expect(normalizeRecordedKeys(['shift'], false).isValid).toBe(false);
  });
});
