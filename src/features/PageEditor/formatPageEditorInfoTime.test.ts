import { describe, expect, it } from 'vitest';

import { formatPageEditorInfoTime } from './formatPageEditorInfoTime';

describe('formatPageEditorInfoTime', () => {
  it('formats page info time as a numeric date and time in every language', () => {
    expect(formatPageEditorInfoTime(new Date(2026, 6, 1, 12, 16))).toBe('2026/07/01 12:16');
  });

  it('returns empty text for missing or invalid values', () => {
    expect(formatPageEditorInfoTime(undefined)).toBe('');
    expect(formatPageEditorInfoTime('invalid')).toBe('');
  });
});
