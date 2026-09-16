import { describe, expect, it } from 'vitest';

import { desktopRoutes } from '@/spa/router/desktopRouter.config';

import { isMainLayoutLocation } from './routeScope';

// Paths that render the nav panel + rounded container the shell imitates.
const MAIN_LAYOUT_PATHS = ['/', '/agent/agent-1', '/settings/memory', '/acme/settings/oauth-apps'];

describe('isMainLayoutLocation', () => {
  it('recognises main-layout urls', () => {
    for (const pathname of MAIN_LAYOUT_PATHS) {
      expect(isMainLayoutLocation(desktopRoutes, pathname), `${pathname} is main layout`).toBe(
        true,
      );
    }
  });

  // The shell would otherwise promise chrome these pages never render — the
  // exact "logo → app-shell skeleton → logo → page" sequence this guards.
  it('excludes standalone routes outside the main layout', () => {
    for (const pathname of ['/desktop-onboarding', '/verify-im', '/acceptance']) {
      expect(isMainLayoutLocation(desktopRoutes, pathname), `${pathname} is standalone`).toBe(
        false,
      );
    }
  });

  it('honours an explicit basename', () => {
    const base = '/_base';

    expect(isMainLayoutLocation(desktopRoutes, `${base}/agent/agent-1`, base)).toBe(true);
    // Without it the prefix is eaten as a `:workspaceSlug`, so `/desktop-onboarding`
    // stops being recognised as standalone — which is why the entry must pass it.
    expect(isMainLayoutLocation(desktopRoutes, `${base}/desktop-onboarding`, base)).toBe(false);
    expect(isMainLayoutLocation(desktopRoutes, `${base}/desktop-onboarding`)).toBe(true);
  });

  // Not a "known route" test: the main area carries a `:workspaceSlug` segment,
  // so an unrecognised path really does render the main layout and the shell is
  // the right placeholder for it.
  it('treats an unrecognised path as a workspace inside the main layout', () => {
    expect(isMainLayoutLocation(desktopRoutes, '/_nonexistent_top_level')).toBe(true);
  });
});
