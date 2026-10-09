import { describe, expect, it } from 'vitest';

import { resolveAccountLabel } from './accountLabel';

describe('resolveAccountLabel', () => {
  it('prefers the full name', () => {
    expect(resolveAccountLabel({ email: 'a@b.co', fullName: 'Ada Lovelace' })).toBe('Ada Lovelace');
  });

  it('falls back to the email when the name is empty or blank', () => {
    expect(resolveAccountLabel({ email: 'a@b.co', fullName: '' })).toBe('a@b.co');
    expect(resolveAccountLabel({ email: 'a@b.co', fullName: '   ' })).toBe('a@b.co');
  });

  it('returns nothing when neither is known', () => {
    expect(resolveAccountLabel({})).toBe('');
  });
});
