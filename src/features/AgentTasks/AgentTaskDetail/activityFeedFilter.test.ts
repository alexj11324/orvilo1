import { describe, expect, it } from 'vitest';

import {
  activityFilterStorageKey,
  matchesActivityFilter,
  readStoredActivityFilter,
  writeStoredActivityFilter,
} from './activityFeedFilter';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('matchesActivityFilter', () => {
  it('keeps comments out of the updates feed', () => {
    expect(matchesActivityFilter('comment', 'comments')).toBe(true);
    expect(matchesActivityFilter('comment', 'updates')).toBe(false);
    expect(matchesActivityFilter('property', 'updates')).toBe(true);
    expect(matchesActivityFilter('topic', 'updates')).toBe(true);
    expect(matchesActivityFilter('topic', 'all')).toBe(true);
  });
});

describe('stored activity filter', () => {
  it('defaults to all', () => {
    expect(readStoredActivityFilter('u1', memoryStorage())).toBe('all');
  });

  it('round-trips the choice per user', () => {
    const storage = memoryStorage();
    writeStoredActivityFilter('u1', 'comments', storage);
    expect(readStoredActivityFilter('u1', storage)).toBe('comments');
    expect(readStoredActivityFilter('u2', storage)).toBe('all');
  });

  it('ignores an unknown stored value', () => {
    const storage = memoryStorage({ [activityFilterStorageKey('u1')]: 'sideways' });
    expect(readStoredActivityFilter('u1', storage)).toBe('all');
  });

  it('survives blocked storage', () => {
    expect(readStoredActivityFilter('u1', throwingStorage)).toBe('all');
    expect(() => writeStoredActivityFilter('u1', 'updates', throwingStorage)).not.toThrow();
  });
});
