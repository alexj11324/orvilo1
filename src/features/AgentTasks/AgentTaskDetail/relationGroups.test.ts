import { describe, expect, it } from 'vitest';

import { isOpenBlocker, relationKindOf } from './relationGroups';

describe('relationKindOf', () => {
  it('keeps an unmarked blocks edge as blocked-by', () => {
    expect(relationKindOf({ type: 'blocks' })).toBe('blockedBy');
    expect(relationKindOf({ direction: 'blockedBy', type: 'blocks' })).toBe('blockedBy');
  });

  it('splits the reverse blocks edge into blocking', () => {
    expect(relationKindOf({ direction: 'blocking', type: 'blocks' })).toBe('blocking');
  });

  it('treats relates as its own group', () => {
    expect(relationKindOf({ type: 'relates' })).toBe('relates');
    expect(relationKindOf({ type: 'duplicate' })).toBeNull();
  });
});

describe('isOpenBlocker', () => {
  it('ignores issues this one blocks', () => {
    expect(isOpenBlocker({ direction: 'blocking', status: 'backlog', type: 'blocks' })).toBe(false);
  });

  it('treats a missing status as still blocking the run', () => {
    expect(isOpenBlocker({ status: null, type: 'blocks' })).toBe(true);
    expect(isOpenBlocker({ status: 'completed', type: 'blocks' })).toBe(false);
  });
});
