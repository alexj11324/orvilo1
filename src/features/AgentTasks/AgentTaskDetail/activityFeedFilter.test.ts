import { describe, expect, it } from 'vitest';

import { filterActivitiesForFeed, matchesActivityFilter } from './activityFeedFilter';

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

  it('includes the linked comment even when the active filter hides comments', () => {
    expect(filterActivitiesForFeed(activities, 'updates', '#comment-c1')).toEqual([
      activities[0],
      activities[2],
    ]);
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
