import { describe, expect, it } from 'vitest';

import {
  activityFilterStorageKey,
  filterActivitiesForFeed,
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

describe('comment deep links in the activity feed', () => {
  const activities = [
    { id: 'c1', type: 'comment' as const },
    { id: 'c2', type: 'comment' as const },
    { id: 'update1', type: 'property' as const },
  ];

  it('includes the linked comment with Updates without changing the stored preference', () => {
    const storage = memoryStorage({ [activityFilterStorageKey('u1')]: 'updates' });
    const filter = readStoredActivityFilter('u1', storage);
    expect(filterActivitiesForFeed(activities, filter, '#comment-c1')).toEqual([
      activities[0],
      activities[2],
    ]);
    expect(readStoredActivityFilter('u1', storage)).toBe('updates');
  });

  it('keeps normal filters for missing, unknown or non-comment fragments', () => {
    for (const hash of ['', '#comment-c10', '#comment-update1']) {
      expect(filterActivitiesForFeed(activities, 'updates', hash)).toEqual([activities[2]]);
    }
    expect(filterActivitiesForFeed(activities, 'comments', '#comment-c1')).toEqual(
      activities.slice(0, 2),
    );
    expect(filterActivitiesForFeed(activities, 'all', '#comment-c1')).toEqual(activities);
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

  it.each(['read', 'write'] as const)(
    'survives a blocked browser storage getter on %s',
    (operation) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('Storage access is blocked', 'SecurityError');
        },
      });
      try {
        if (operation === 'read') expect(readStoredActivityFilter('u1')).toBe('all');
        else expect(() => writeStoredActivityFilter('u1', 'updates')).not.toThrow();
        expect(readStoredActivityFilter('u1', memoryStorage())).toBe('all');
      } finally {
        if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
      }
    },
  );
});
