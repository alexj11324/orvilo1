import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WORKSPACE_SETTINGS_ALIASES } from '@/config/routes/settings';

import { createMainAreaChildren as createWebMainAreaChildren } from './desktopRouter.config';
import { createMainAreaChildren as createElectronMainAreaChildren } from './desktopRouter.config.desktop';
import { mobileRoutes } from './mobileRouter.config';

/**
 * Legacy `/:workspaceSlug/settings/<alias>` deep links.
 *
 * Both routers used to spell these out by hand — `provider` and
 * `service-model` in the middle of the tab list, `creds` and `stats` next to
 * the tabs they alias — so the same redirect existed in four places and none of
 * them knew about the others. They are built from `WORKSPACE_SETTINGS_ALIASES`
 * now, and these tests pin that every entry actually reaches a router.
 */
type Routes = Parameters<typeof matchRoutes>[0];

const webMainArea: Routes = [{ children: createWebMainAreaChildren(), path: '/' }];
const electronMainArea: Routes = [{ children: createElectronMainAreaChildren(), path: '/' }];

const surfaces: Array<[string, Routes]> = [
  ['Web', webMainArea],
  ['Electron', electronMainArea],
  ['Mobile', mobileRoutes],
];

/**
 * The desktop tree carries every workspace settings tab. Mobile mirrors a
 * subset — `credential` and `statistics` have no mobile route — so the alias
 * targets cannot be asserted there; that gap predates this registry.
 */
const desktopSurfaces = surfaces.filter(([name]) => name !== 'Mobile');

const leafOf = (routes: Routes, pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route;

const redirectOf = (routes: Routes, pathname: string) =>
  matchRoutes(routes, pathname)?.at(-1)?.route.element as { props?: { to?: string } } | undefined;

describe('workspace settings legacy aliases', () => {
  it('declares the aliases the routers must keep', () => {
    const aliases = WORKSPACE_SETTINGS_ALIASES.map((entry) => entry.alias);

    expect(aliases).toContain('provider');
    expect(aliases).toContain('service-model');
    expect(aliases).toContain('creds');
    expect(aliases).toContain('stats');
  });

  it.each(surfaces)('%s redirects every alias to its live workspace tab', (_, routes) => {
    for (const { alias, target } of WORKSPACE_SETTINGS_ALIASES) {
      const pathname = `/acme/settings/${alias}`;
      const expected = target === 'root' ? '..' : `../${target}`;

      expect(redirectOf(routes, pathname)?.props?.to, `${pathname} does not redirect`).toBe(
        expected,
      );
    }
  });

  it.each(surfaces)('%s keeps the sub-paths of an alias that declares them', (_, routes) => {
    for (const { alias, subPaths, target } of WORKSPACE_SETTINGS_ALIASES) {
      if (!subPaths) continue;

      const pathname = `/acme/settings/${alias}/client-1`;
      const expected = target === 'root' ? '..' : `../${target}`;

      expect(redirectOf(routes, pathname)?.props?.to, `${pathname} does not redirect`).toBe(
        expected,
      );
    }
  });

  it.each(desktopSurfaces)('%s keeps the live tab addressable beside its alias', (_, routes) => {
    // `/acme/settings/credential` is the page; `/acme/settings/creds` is the
    // legacy spelling. Only the first may render — an alias that outranked its
    // own target would make the page unreachable.
    for (const { target } of WORKSPACE_SETTINGS_ALIASES) {
      if (target === 'root') continue;

      expect(leafOf(routes, `/acme/settings/${target}`)?.path, `${target} is shadowed`).toBe(
        target,
      );
    }
  });
});
