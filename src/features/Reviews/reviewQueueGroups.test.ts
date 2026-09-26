import { describe, expect, it } from 'vitest';

import {
  inProductReviewsCount,
  REVIEW_QUEUE_GROUP_LABEL_KEYS,
  reviewQueueGroups,
  type ReviewQueueItem,
} from './reviewQueueGroups';

const item = (over: Partial<ReviewQueueItem>): ReviewQueueItem => ({
  additions: 0,
  author: 'octocat',
  authorAvatar: null,
  changedFiles: 0,
  deletions: 0,
  id: `gh:github.com:org:repo:${over.number ?? 1}`,
  isDraft: false,
  mergeStateStatus: null,
  number: 1,
  repository: 'org/repo',
  reviewDecision: null,
  title: 'pull request',
  updatedAt: null,
  url: 'https://github.com/org/repo/pull/1',
  ...over,
});

describe('reviewQueueGroups', () => {
  it('puts a GitHub CLEAN PR in Ready to merge even without an approval review', () => {
    const groups = reviewQueueGroups(
      [
        item({ author: 'me', mergeStateStatus: 'CLEAN', number: 1, reviewDecision: null }),
        item({ author: 'me', mergeStateStatus: 'BLOCKED', number: 2, reviewDecision: 'APPROVED' }),
      ],
      { tab: 'for-me', viewer: 'me' },
    );
    expect(groups.map((group) => group.key)).toEqual(['ready-to-merge', 'created-by-you']);
    expect(groups[0]?.items.map((row) => row.number)).toEqual([1]);
    expect(groups[1]?.items.map((row) => row.number)).toEqual([2]);
  });

  it('keeps the created tab under the single Open bucket', () => {
    const groups = reviewQueueGroups(
      [item({ number: 1 }), item({ number: 2, reviewDecision: 'APPROVED' })],
      { tab: 'created', viewer: 'me' },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('open');
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('buckets the for-me queue into ready / pull-requests / created-by-you', () => {
    const groups = reviewQueueGroups(
      [
        item({ author: 'me', mergeStateStatus: 'CLEAN', number: 1, reviewDecision: 'APPROVED' }),
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
    // A merge-ready own PR leads the lane instead of filing under authored PRs.
    expect(groups[0]?.items.map((row) => row.number)).toEqual([1]);
    expect(groups[1]?.items.map((row) => row.number)).toEqual([2, 3]);
    expect(groups[2]?.items.map((row) => row.number)).toEqual([4]);
  });

  it('buckets an authored PR that reached for-me via authorship under created-by-you', () => {
    // The for-me search is author ∪ review-requested — a PR that only
    // matches the author side (no pending request) still files by author.
    const groups = reviewQueueGroups(
      [
        item({ author: 'me', number: 1 }),
        item({ author: 'me', number: 2, reviewDecision: 'REVIEW_REQUIRED' }),
        item({ number: 3, reviewDecision: 'REVIEW_REQUIRED' }),
      ],
      { tab: 'for-me', viewer: 'me' },
    );
    expect(groups.map((group) => group.key)).toEqual(['pull-requests', 'created-by-you']);
    expect(groups[0]?.items.map((row) => row.number)).toEqual([3]);
    expect(groups[1]?.items.map((row) => row.number)).toEqual([1, 2]);
  });

  it('uses the ready label only for a GitHub merge-ready state', () => {
    expect(REVIEW_QUEUE_GROUP_LABEL_KEYS['ready-to-merge']).toBe('reviews.groups.readyToMerge');
    expect(
      reviewQueueGroups([item({ reviewDecision: 'APPROVED', mergeStateStatus: 'UNKNOWN' })], {
        tab: 'for-me',
        viewer: 'me',
      })[0]?.key,
    ).toBe('pull-requests');
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

  it('matches author to viewer case-insensitively (GitHub logins)', () => {
    const groups = reviewQueueGroups(
      [item({ author: 'OctoCat', number: 1 }), item({ author: 'hubot', number: 2 })],
      { tab: 'for-me', viewer: 'octocat' },
    );
    expect(groups.map((group) => group.key)).toEqual(['pull-requests', 'created-by-you']);
    expect(groups[0]?.items.map((row) => row.number)).toEqual([2]);
    expect(groups[1]?.items.map((row) => row.number)).toEqual([1]);
  });
});

describe('inProductReviewsCount', () => {
  const group = (tasks: number, total?: number) => ({
    tasks: Array.from({ length: tasks }, (_, index) => index),
    total,
  });

  it('is undefined until the first response lands', () => {
    expect(
      inProductReviewsCount({
        externalCount: 0,
        groups: [],
        loaded: false,
        loadedTaskCount: 0,
        total: undefined,
      }),
    ).toBeUndefined();
  });

  it('prefers the server task total plus external reviews', () => {
    expect(
      inProductReviewsCount({
        externalCount: 2,
        groups: [group(3, 3)],
        loaded: true,
        loadedTaskCount: 3,
        total: 40,
      }),
    ).toBe(42);
  });

  it('falls back to the summed merged-group counts so tail-loaded buckets count', () => {
    expect(
      inProductReviewsCount({
        externalCount: 1,
        groups: [group(30, 50), group(10)],
        loaded: true,
        loadedTaskCount: 40,
        total: undefined,
      }),
    ).toBe(61);
  });

  it('falls back to the loaded task count for an ungrouped result', () => {
    expect(
      inProductReviewsCount({
        externalCount: 0,
        groups: [],
        loaded: true,
        loadedTaskCount: 7,
        total: undefined,
      }),
    ).toBe(7);
  });

  it('keeps a real zero total instead of dropping to the fallback', () => {
    expect(
      inProductReviewsCount({
        externalCount: 3,
        groups: [],
        loaded: true,
        loadedTaskCount: 0,
        total: 0,
      }),
    ).toBe(3);
  });
});
