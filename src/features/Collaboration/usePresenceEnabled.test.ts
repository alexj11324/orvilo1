import { describe, expect, it } from 'vitest';

import { presenceFlagEnabled } from './usePresenceEnabled';

describe('presenceFlagEnabled', () => {
  it('defaults to enabled when the flag is absent — the schema has no such key yet', () => {
    expect(presenceFlagEnabled({})).toBe(true);
  });

  it('honors an explicit false from either flag spelling', () => {
    expect(presenceFlagEnabled({ 'collaboration.presence': false })).toBe(false);
    expect(presenceFlagEnabled({ collaborationPresence: false })).toBe(false);
  });

  it('honors an explicit true', () => {
    expect(presenceFlagEnabled({ 'collaboration.presence': true })).toBe(true);
    expect(presenceFlagEnabled({ collaborationPresence: true })).toBe(true);
  });

  it('disables on a malformed non-boolean flag value — strict true only', () => {
    expect(presenceFlagEnabled({ 'collaboration.presence': 'yes' })).toBe(false);
  });

  it('an explicit caller override wins over the flag', () => {
    expect(presenceFlagEnabled({ 'collaboration.presence': true }, false)).toBe(false);
  });
});
