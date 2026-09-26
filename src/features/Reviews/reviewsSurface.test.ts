import { describe, expect, it } from 'vitest';

import {
  reviewBranchState,
  reviewsDetailPath,
  reviewsIsNarrow,
  reviewsListPath,
  reviewsSurface,
  reviewsTabDestination,
  reviewSubmitScope,
} from './reviewsSurface';

describe('reviewsSurface', () => {
  it('keeps the queue and preview together on a wide work surface', () => {
    expect(reviewsSurface(false, false)).toBe('split');
    expect(reviewsSurface(false, true)).toBe('split');
  });

  it('shows one review surface at a time on a narrow work surface', () => {
    expect(reviewsSurface(true, false)).toBe('list');
    expect(reviewsSurface(true, true)).toBe('detail');
  });
});

describe('Reviews queue routes', () => {
  it('preserves the active queue tab in list and detail URLs', () => {
    expect(reviewsListPath('for-me')).toBe('/reviews');
    expect(reviewsListPath('created')).toBe('/reviews?tab=created');
    expect(reviewsDetailPath('gh:github.com:org:repo:42', 'created')).toBe(
      '/reviews/gh%3Agithub.com%3Aorg%3Arepo%3A42?tab=created',
    );
  });
});

describe('reviewsIsNarrow', () => {
  it('uses the desktop breakpoint instead of cumulative device flags', () => {
    expect(reviewsIsNarrow(true)).toBe(false);
    expect(reviewsIsNarrow(false)).toBe(true);
    expect(reviewsIsNarrow(undefined)).toBe(false);
  });
});

describe('reviewsTabDestination', () => {
  it('targets the collection route so a queue-scope change clears selected detail', () => {
    expect(reviewsTabDestination('for-me')).toBe('/reviews');
    expect(reviewsTabDestination('created')).toBe('/reviews?tab=created');
  });
});

describe('reviewSubmitScope', () => {
  it('hides the composer when writes are disabled or the viewer is unknown', () => {
    expect(reviewSubmitScope({ reviewWritesEnabled: false, viewerLogin: 'octocat' })).toBe('none');
    expect(reviewSubmitScope({ reviewWritesEnabled: true })).toBe('none');
  });

  it('limits the pull request author to comment-only reviews', () => {
    expect(
      reviewSubmitScope({
        author: 'OctoCat',
        reviewWritesEnabled: true,
        viewerLogin: 'octocat',
      }),
    ).toBe('comment-only');
  });

  it('grants other collaborators the full review events', () => {
    expect(
      reviewSubmitScope({
        author: 'octocat',
        reviewWritesEnabled: true,
        viewerLogin: 'hubot',
      }),
    ).toBe('full');
  });
});

describe('reviewBranchState', () => {
  it('reports mergeable heads as conflict-free, not up to date', () => {
    // A mergeable head may still lack base commits when the branch does not
    // have to be up to date — CLEAN must not claim "up to date".
    expect(reviewBranchState('CLEAN')).toBe('no-conflicts');
    expect(reviewBranchState('HAS_HOOKS')).toBe('no-conflicts');
  });

  it('reports a head that must update as behind', () => {
    expect(reviewBranchState('BEHIND')).toBe('behind');
  });

  it('falls back to bare refs for every other state', () => {
    expect(reviewBranchState('BLOCKED')).toBe('refs');
    expect(reviewBranchState('UNKNOWN')).toBe('refs');
    expect(reviewBranchState(null)).toBe('refs');
  });
});
