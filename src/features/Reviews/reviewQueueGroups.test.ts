import { describe, expect, it } from 'vitest';

import { reviewQueueGroups, type ReviewQueueItem } from './reviewQueueGroups';

const item = (over: Partial<ReviewQueueItem>): ReviewQueueItem => ({
  additions: 0,
  author: 'octocat',
  authorAvatar: null,
  changedFiles: 0,
  deletions: 0,
  id: `gh:github.com:org:repo:${over.number ?? 1}`,
  isDraft: false,
  number: 1,
  repository: 'org/repo',
  reviewDecision: null,
  title: 'pull request',
  updatedAt: null,
  url: 'https://github.com/org/repo/pull/1',
  ...over,
});

describe('reviewQueueGroups', () => {
  it('keeps the created tab under the single Open bucket', () => {
    const groups = reviewQueueGroups(
      [item({ number: 1 }), item({ number: 2, reviewDecision: 'APPROVED' })],
      { tab: 'created', viewer: 'me' },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('open');
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('buckets the for-me queue into ready-to-merge / pull-requests / created-by-you', () => {
    const groups = reviewQueueGroups(
      [
        item({ author: 'me', number: 1, reviewDecision: 'APPROVED' }),
        item({ number: 2, reviewDecision: 'REVIEW_REQUIRED' }),
        item({ number: 3, reviewDecision: 'CHANGES_REQUESTED' }),
        item({ author: 'me', number: 4 }),
      ],
      { tab: 'for-me', viewer: 'me' },
    );
    expect(groups.map((group) => group.key)).toEqual([
      'ready-to-merge',
      'pull-requests',
      'created-by-you',
    ]);
    // An approved own PR is ready to merge, not filed under created-by-you.
    expect(groups[0]?.items.map((row) => row.number)).toEqual([1]);
    expect(groups[1]?.items.map((row) => row.number)).toEqual([2, 3]);
    expect(groups[2]?.items.map((row) => row.number)).toEqual([4]);
  });

  it('drops empty buckets so a uniform queue keeps one header', () => {
    const groups = reviewQueueGroups(
      [item({ number: 1 }), item({ number: 2, reviewDecision: 'REVIEW_REQUIRED' })],
      { tab: 'for-me', viewer: 'me' },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('pull-requests');
  });

  it('returns no groups for an empty queue', () => {
    expect(reviewQueueGroups([], { tab: 'for-me', viewer: 'me' })).toEqual([]);
    expect(reviewQueueGroups([], { tab: 'created', viewer: 'me' })).toEqual([]);
  });

  it('treats a null viewer as no created-by-you membership', () => {
    const groups = reviewQueueGroups([item({ author: 'me', number: 1 })], {
      tab: 'for-me',
      viewer: null,
    });
    expect(groups.map((group) => group.key)).toEqual(['pull-requests']);
  });
});
