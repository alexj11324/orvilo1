import { describe, expect, it } from 'vitest';

import { parseOrviloLink } from './parse';

describe('parseOrviloLink', () => {
  it('parses github pull request', () => {
    expect(parseOrviloLink('https://github.com/alexj11324/orvilo1/pull/15557')).toEqual({
      canonicalLabel: 'alexj11324/orvilo1#15557',
      kind: 'github',
    });
  });

  it('parses github issue', () => {
    expect(parseOrviloLink('https://github.com/alexj11324/orvilo1/issues/15554')).toEqual({
      canonicalLabel: 'alexj11324/orvilo1#15554',
      kind: 'github',
    });
  });

  it('parses github commit (short sha)', () => {
    expect(parseOrviloLink('https://github.com/alexj11324/orvilo1/commit/d36aa75701abc')).toEqual({
      canonicalLabel: 'alexj11324/orvilo1@d36aa75',
      kind: 'github',
    });
  });

  it('parses github repo root', () => {
    expect(parseOrviloLink('https://github.com/alexj11324/orvilo1')).toEqual({
      canonicalLabel: 'alexj11324/orvilo1',
      kind: 'github',
    });
  });

  it('parses linear issue', () => {
    expect(parseOrviloLink('https://linear.app/orvilo/issue/TST-10001/codex-pptx-preview')).toEqual(
      {
        canonicalLabel: 'TST-10001',
        kind: 'linear',
      },
    );
  });

  it('parses github user / org pages with the github icon', () => {
    expect(parseOrviloLink('https://github.com/orvilo')).toEqual({
      canonicalLabel: 'orvilo',
      kind: 'github',
    });
  });

  it('uses the full URL as label for generic http links', () => {
    expect(parseOrviloLink('https://example.com/foo')).toEqual({
      canonicalLabel: 'https://example.com/foo',
      domain: 'example.com',
      kind: 'generic',
    });
    // bare github.com (no owner) → generic
    expect(parseOrviloLink('https://github.com')?.kind).toBe('generic');
  });

  it('labels npm packages by package name', () => {
    expect(parseOrviloLink('https://www.npmjs.com/package/@lobehub/ui')).toEqual({
      canonicalLabel: '@lobehub/ui',
      domain: 'npmjs.com',
      kind: 'generic',
    });
    expect(parseOrviloLink('https://www.npmjs.com/package/react/v/18.0.0')?.canonicalLabel).toBe(
      'react',
    );
  });

  it('labels figma links by file name', () => {
    expect(parseOrviloLink('https://www.figma.com/file/abc123/Design-File')?.canonicalLabel).toBe(
      'Design File',
    );
    expect(parseOrviloLink('https://www.figma.com/design/abc123/My-Board')?.canonicalLabel).toBe(
      'My Board',
    );
  });

  it('parses mailto links as email', () => {
    expect(parseOrviloLink('mailto:hi@example.com')).toEqual({
      canonicalLabel: 'hi@example.com',
      kind: 'email',
    });
    expect(parseOrviloLink('mailto:hi@example.com?subject=Hello')?.canonicalLabel).toBe(
      'hi@example.com',
    );
  });

  it('keeps root-relative links for the internal-link renderer', () => {
    expect(parseOrviloLink('/foo/bar')).toEqual({
      canonicalLabel: '/foo/bar',
      kind: 'generic',
    });
  });

  it('ignores citation, footnote and non-http hrefs', () => {
    expect(parseOrviloLink('citation-1')).toBeNull();
    expect(parseOrviloLink('#user-content-fn-1')).toBeNull();
    expect(parseOrviloLink(undefined)).toBeNull();
  });
});
