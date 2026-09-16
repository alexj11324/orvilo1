import { describe, expect, it } from 'vitest';

import { isRetiredProductUrl } from './retiredProductUrl';

describe('isRetiredProductUrl', () => {
  it.each(['/community', '/community/agent/demo', '/page', '/page/document-id'])(
    'recognizes retired personal route %s',
    (url) => {
      expect(isRetiredProductUrl(url, { type: 'personal' })).toBe(true);
    },
  );

  it.each(['/acme/community', '/acme/community/skill/demo', '/acme/page/document-id'])(
    'recognizes retired workspace route %s',
    (url) => {
      expect(isRetiredProductUrl(url, { slug: 'acme', type: 'workspace' })).toBe(true);
    },
  );

  it('keeps nested document routes inside retained products', () => {
    expect(
      isRetiredProductUrl('/agent/agent-id/topic-id/page/document-id', { type: 'personal' }),
    ).toBe(false);
    expect(
      isRetiredProductUrl('/acme/agent/agent-id/topic-id/page/document-id', {
        slug: 'acme',
        type: 'workspace',
      }),
    ).toBe(false);
  });
});
