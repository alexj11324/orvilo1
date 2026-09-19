import { describe, expect, it } from 'vitest';

import { externalReviewIdentifier, externalReviewOpenHref } from './externalReviewOpen';

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

describe('externalReviewOpenHref', () => {
  it('keeps allowlisted GitHub/Linear URLs clickable and rejects the rest', () => {
    expect(externalReviewOpenHref('https://github.com/orvilo/app/pull/12')).toBe(
      'https://github.com/orvilo/app/pull/12',
    );
    expect(externalReviewOpenHref('https://linear.app/orvilo/issue/NAV-12')).toBe(
      'https://linear.app/orvilo/issue/NAV-12',
    );
    expect(externalReviewOpenHref('javascript:alert(1)')).toBeNull();
    expect(externalReviewOpenHref('https://evil.example/phish')).toBeNull();
    expect(externalReviewOpenHref(null)).toBeNull();
  });
});
