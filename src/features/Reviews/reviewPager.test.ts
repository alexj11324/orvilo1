import { describe, expect, it } from 'vitest';

import {
  applyReviewPagerPage,
  emptyReviewPager,
  reviewPagerKey,
  type ReviewPagerPage,
  reviewPagerScope,
} from './reviewPager';
import type { PullRequestDetail } from './types';

const scope = (over: Record<string, unknown> = {}) => ({
  headSha: 'head-1',
  pullRequestId: 'pr-42',
  snapshotId: 'snap-1',
  viewerLogin: 'octocat',
  workspaceId: 'ws-1',
  ...over,
});

const page = (over: Partial<ReviewPagerPage>): ReviewPagerPage => ({
  collection: 'files',
  endCursor: 'cursor-1',
  hasMore: true,
  items: [],
  stale: false,
  total: 50,
  ...over,
});

describe('reviewPager', () => {
  it('key binds to workspace, PR, snapshot, head, and viewer', () => {
    const key = reviewPagerKey(scope());
    expect(reviewPagerKey(scope())).toBe(key);
    for (const field of ['workspaceId', 'pullRequestId', 'snapshotId', 'headSha', 'viewerLogin']) {
      expect(reviewPagerKey(scope({ [field]: 'changed' }))).not.toBe(key);
    }
  });

  it('appends a page under its generation', () => {
    const key = reviewPagerKey(scope());
    const pager = applyReviewPagerPage(
      emptyReviewPager(key),
      key,
      page({ items: [{ filename: 'a.ts' }], endCursor: 'c1' }),
    );
    expect(pager.files).toHaveLength(1);
    expect(pager.meta.files).toMatchObject({ endCursor: 'c1', hasMore: true, total: 50 });
  });

  it('drops a late write whose generation is gone', () => {
    const oldKey = reviewPagerKey(scope());
    const newKey = reviewPagerKey(scope({ snapshotId: 'snap-2' }));
    // The response belonged to the old snapshot; the pager already moved on.
    const pager = applyReviewPagerPage(
      emptyReviewPager(newKey),
      oldKey,
      page({ items: [{ filename: 'stale.ts' }] }),
    );
    expect(pager.files).toHaveLength(0);
    expect(pager.meta.files).toBeUndefined();
    expect(pager.key).toBe(newKey);
  });

  it('keeps comment tails keyed by thread and records their cursor', () => {
    const key = reviewPagerKey(scope());
    const pager = applyReviewPagerPage(
      emptyReviewPager(key),
      key,
      page({
        collection: 'comments',
        endCursor: 'cc1',
        hasMore: true,
        items: [{ body: 'nice' }],
        threadId: 'T1',
        total: 10,
      }),
    );
    expect(pager.comments.T1).toHaveLength(1);
    expect(pager.meta['comments:T1']).toMatchObject({ endCursor: 'cc1' });

    const second = applyReviewPagerPage(
      pager,
      key,
      page({ collection: 'comments', items: [{ body: 'more' }], threadId: 'T1' }),
    );
    expect(second.comments.T1).toHaveLength(2);
  });

  it('maps pull request detail into the scope — undefined detail yields no pager', () => {
    expect(reviewPagerScope('ws-1', 'pr-42', undefined)).toBeNull();
    const detail = {
      headSha: 'head-9',
      snapshotId: 'snap-9',
      viewerLogin: 'hubot',
    } as PullRequestDetail;
    expect(reviewPagerKey(reviewPagerScope('ws-1', 'pr-42', detail)!)).toBe(
      'ws-1:pr-42:snap-9:head-9:hubot',
    );
  });
});
