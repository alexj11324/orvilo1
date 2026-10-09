import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { createMainAreaChildren as createWebMainAreaChildren } from './desktopRouter.config';
import { mobileRoutes } from './mobileRouter.config';

/**
 * Mobile workspace settings coverage.
 *
 * The mobile `/:slug/settings` subtree used to mirror only a subset of the
 * workspace settings tabs. Navigation still pointed at all of them — the
 * workspace sidebar and `useWorkspaceAwareNavigate` slug-prefix every
 * `settings/<tab>` link — so the tabs without a mobile route fell through to
 * the root `*` catch-all, whose redirect sent the user back to `/`. The
 * subtree now mirrors the desktop leaf set; these tests pin that parity so a
 * future tab added on one side cannot silently bounce on mobile again.
 */
type Routes = Parameters<typeof matchRoutes>[0];

const webMainArea: Routes = [{ children: createWebMainAreaChildren(), path: '/' }];

/** Literal path strings registered under `/:workspaceSlug/settings`. */
const workspaceSettingsLeafPaths = (routes: Routes): string[] => {
  const slugRoute = routes[0]?.children?.find((route) => route.path === ':workspaceSlug');
  const settingsRoute = slugRoute?.children?.find((route) => route.path === 'settings');
  return (settingsRoute?.children ?? []).flatMap((route) =>
    typeof route.path === 'string' ? [route.path] : [],
  );
};

const leafOf = (routes: Routes, pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route;

describe('mobile workspace settings routes', () => {
  // The tabs that bounced home before this fix: they existed on desktop but
  // had no mobile route, so the root catch-all redirected them to `/`.
  it.each([
    'statistics',
    'devices',
    'credential',
    'apikey',
    'connector',
    'integrations',
    'integrations/slack',
    'imports',
    'imports/linear',
  ])('resolves /<slug>/settings/%s on mobile instead of bouncing home', (tab) => {
    expect(leafOf(mobileRoutes, `/acme/settings/${tab}`)?.path).toBe(tab);
  });

  it('mirrors every leaf the desktop workspace settings table registers', () => {
    const desktopTabs = workspaceSettingsLeafPaths(webMainArea);

    expect(desktopTabs.length).toBeGreaterThan(0);

    for (const tab of desktopTabs) {
      const pathname = `/acme/settings/${tab.replaceAll(':sub', 'detail')}`;

      expect(leafOf(mobileRoutes, pathname)?.path, `${pathname} is not served on mobile`).toBe(tab);
    }
  });

  it('keeps the legacy alias targets renderable on mobile', () => {
    // `creds`/`stats` redirect to `credential`/`statistics` — the pages these
    // tests guard above. Without them the alias chain ended at the catch-all.
    for (const target of ['credential', 'statistics']) {
      expect(leafOf(mobileRoutes, `/acme/settings/${target}`)?.path).toBe(target);
    }
  });
});
