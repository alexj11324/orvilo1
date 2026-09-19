import { describe, expect, it } from 'vitest';

import { externalReviewIdentifier } from './externalReviewOpen';

describe('externalReviewIdentifier', () => {
  it('shows owner/repo#number for GitHub pull requests and issues', () => {
    expect(externalReviewIdentifier('https://github.com/orvilo/app/pull/12')).toBe('orvilo/app#12');
    expect(externalReviewIdentifier('https://github.com/orvilo/app/issues/9')).toBe('orvilo/app#9');
  });

  it('shows the Linear issue path and ignores missing or junk URLs', () => {
    expect(externalReviewIdentifier('https://linear.app/orvilo/issue/NAV-12')).toBe(
      'orvilo/issue/NAV-12',
    );
    expect(externalReviewIdentifier(null)).toBeNull();
    expect(externalReviewIdentifier('not a url')).toBeNull();
  });
});
