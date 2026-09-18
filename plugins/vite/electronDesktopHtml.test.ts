import { describe, expect, it } from 'vitest';

import { resolveDesktopHtml } from './electronDesktopHtml';

const DESKTOP = '/apps/desktop/index.html';
const POPUP = '/apps/desktop/popup.html';
const OVERLAY = '/apps/desktop/overlay.html';

const DOCUMENT_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

// The two navigation signals are exercised one at a time: a proxy that preserves
// only one of them must still be routed correctly, so no case may rely on the
// pair being sent together.
const acceptOnly = (url: string) => resolveDesktopHtml(url, DOCUMENT_ACCEPT, undefined);
const destOnly = (url: string) => resolveDesktopHtml(url, undefined, 'document');
const subresource = (url: string) => resolveDesktopHtml(url, '*/*', 'empty');

describe('resolveDesktopHtml', () => {
  describe('explicit document entries', () => {
    it.each([
      ['/', DESKTOP],
      ['/index.html', DESKTOP],
      ['/overlay', OVERLAY],
      ['/overlay.html', OVERLAY],
      ['/popup.html', POPUP],
    ])('maps %s to %s', (url, expected) => {
      expect(resolveDesktopHtml(url, undefined, undefined)).toBe(expected);
    });
  });

  describe('deep links', () => {
    it('maps an Electron deep link to the desktop entry, not the web one', () => {
      expect(acceptOnly('/desktop-onboarding?screen=welcome')).toBe(DESKTOP);
      expect(destOnly('/desktop-onboarding?screen=welcome')).toBe(DESKTOP);
    });

    it('maps a nested dotted route slug, which the updater restores as a route', () => {
      // `extractRestoreRoute` keeps this one for the same reason: the dot test
      // belongs to root-level filenames only.
      expect(acceptOnly('/community/skill/github.owner.repo')).toBe(DESKTOP);
    });

    it('maps a popup deep link to the popup entry', () => {
      expect(acceptOnly('/popup/agent/A/T')).toBe(POPUP);
      expect(acceptOnly('/popup')).toBe(POPUP);
    });

    it('leaves a subresource request alone', () => {
      // Answering these with a document would swap a module for a page.
      expect(subresource('/desktop-onboarding')).toBeUndefined();
      expect(subresource('/community/skill/github.owner.repo')).toBeUndefined();
      expect(resolveDesktopHtml('/desktop-onboarding', undefined, undefined)).toBeUndefined();
    });
  });

  describe('real files', () => {
    it.each([
      '/favicon.ico',
      '/manifest.webmanifest',
      '/not-compatible.html',
      // Pins the root-level shape: a rewrite of the dot test that only tolerates
      // a single dot (`[^/][^./]*\.[^/]+`) silently stops covering these.
      '/sitemap.xml.gz',
      '/app.min.js',
      '/assets/index-abc123.js',
      '/@vite/client',
      '/@fs/tmp/entry.desktop.tsx',
      '/src/spa/entry.desktop.tsx',
      '/node_modules/.vite/deps/url-join.js',
      '/apps/desktop/index.html',
      '/packages/business/const/src/branding.ts',
    ])('is served by Vite as-is: %s', (url) => {
      expect(acceptOnly(url)).toBeUndefined();
      expect(destOnly(url)).toBeUndefined();
    });
  });
});
