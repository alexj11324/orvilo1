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

  it('keeps retired-but-resolving prefixes', () => {
    // `/memory` is unlisted in navigation but `/memory/preferences` still
    // hosts the manager; `/apps` redirects to Settings > About. Neither is a
    // dead end, so stored references must survive.
    expect(isRetiredProductUrl('/memory', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/memory/preferences', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/apps', { type: 'personal' })).toBe(false);
    expect(
      isRetiredProductUrl('/acme/memory/preferences', { slug: 'acme', type: 'workspace' }),
    ).toBe(false);
    expect(isRetiredProductUrl('/acme/apps', { slug: 'acme', type: 'workspace' })).toBe(false);
  });

  it('matches the product segment only, never a live second segment', () => {
    // `/settings/memory` is the settings tab — segment two matching a dead
    // prefix must not condemn the URL (the old two-segment scan dropped it).
    expect(isRetiredProductUrl('/settings/memory', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/settings/appearance', { type: 'personal' })).toBe(false);
  });

  it('matches a path segment, never a word that merely starts the same', () => {
    // `/resource/images` is a resource-library category, not the retired
    // generation workbench; a raw `startsWith` would drop the reference.
    expect(isRetiredProductUrl('/images', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/resource/images', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/resource/videos', { type: 'personal' })).toBe(false);
    expect(isRetiredProductUrl('/tasks', { type: 'personal' })).toBe(false);
  });

  it('reads the path out of an absolute URL', () => {
    expect(isRetiredProductUrl('https://app.example.com/image/123', { type: 'personal' })).toBe(
      true,
    );
    expect(
      isRetiredProductUrl('https://app.example.com/acme/page/doc-1', {
        slug: 'acme',
        type: 'workspace',
      }),
    ).toBe(true);
    expect(
      isRetiredProductUrl('https://app.example.com/memory/preferences', { type: 'personal' }),
    ).toBe(false);
  });

  it('treats an unparseable URL as live rather than dropping it', () => {
    expect(isRetiredProductUrl('not a url ://', { type: 'personal' })).toBe(false);
  });
});
