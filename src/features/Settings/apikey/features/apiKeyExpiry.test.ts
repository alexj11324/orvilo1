import { describe, expect, it } from 'vitest';

import { isExpiryUnchanged } from './apiKeyExpiry';

describe('isExpiryUnchanged', () => {
  const stored = new Date('2027-01-15T00:00:00.000Z');

  it('treats the same instant as unchanged even when it arrives as a string', () => {
    expect(isExpiryUnchanged('2027-01-15T00:00:00.000Z', stored)).toBe(true);
    expect(isExpiryUnchanged(new Date(stored), stored)).toBe(true);
  });

  it('detects a different date', () => {
    expect(isExpiryUnchanged('2027-02-01T00:00:00.000Z', stored)).toBe(false);
  });

  it('treats clearing an unset expiry as unchanged and clearing a set one as a change', () => {
    expect(isExpiryUnchanged('', null)).toBe(true);
    expect(isExpiryUnchanged(undefined, undefined)).toBe(true);
    expect(isExpiryUnchanged('', stored)).toBe(false);
  });

  it('treats setting an expiry on a key that had none as a change', () => {
    expect(isExpiryUnchanged('2027-02-01T00:00:00.000Z', null)).toBe(false);
  });

  it('refuses to apply an unparsable value', () => {
    expect(isExpiryUnchanged('not a date', stored)).toBe(true);
  });
});
