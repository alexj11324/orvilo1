import { describe, expect, it } from 'vitest';

import { externalReviewOpenUrl } from '../workQuery';

describe('externalReviewOpenUrl', () => {
  it('keeps allowlisted GitHub URLs and drops javascript or off-host jumps', () => {
    expect(externalReviewOpenUrl('https://github.com/orvilo/app/pull/12')).toBe(
      'https://github.com/orvilo/app/pull/12',
    );
    expect(externalReviewOpenUrl('javascript:alert(1)')).toBeNull();
    expect(externalReviewOpenUrl('https://evil.example/phish')).toBeNull();
    expect(externalReviewOpenUrl('/settings/provider')).toBeNull();
  });
});
