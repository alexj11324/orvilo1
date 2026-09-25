import { describe, expect, it } from 'vitest';

import {
  reviewsDetailPath,
  reviewsIsNarrow,
  reviewsListPath,
  reviewsSurface,
  reviewsTabDestination,
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
