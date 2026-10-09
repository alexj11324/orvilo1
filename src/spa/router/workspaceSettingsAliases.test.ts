import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WORKSPACE_SETTINGS_ALIASES } from '@/config/routes/settings';

import { createMainAreaChildren as createWebMainAreaChildren } from './desktopRouter.config';
import { createMainAreaChildren as createElectronMainAreaChildren } from './desktopRouter.config.desktop';
import { mobileRoutes } from './mobileRouter.config';

/**
 * Legacy `/:workspaceSlug/settings/<alias>` deep links.
 *
 * Both routers used to spell these out by hand — `creds` and `stats` next to
 * the tabs they alias — so the same redirect existed in several places and none
 * of them knew about the others. They are built from
 * `WORKSPACE_SETTINGS_ALIASES` now, and these tests pin that every entry
 * actually reaches a router.
 *
 * `provider` and `service-model` are aliases onto the personal pages (absolute
 * targets): provider bindings and model assignments are per-user, so the
 * workspace copies were retired.
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
 * Every surface carries the workspace settings tabs these aliases land on —
 * mobile included, whose `/:slug/settings` subtree mirrors the desktop leaf
 * set (see `mobileRouter.workspaceSettings.test.ts`).
 */

const expectedRedirect = (target: string) => {
  if (target === 'root') return '..';
  return target.startsWith('/') ? target : `../${target}`;
};

const leafOf = (routes: Routes, pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route;

const redirectOf = (routes: Routes, pathname: string) =>
  matchRoutes(routes, pathname)?.at(-1)?.route.element as { props?: { to?: string } } | undefined;

describe('workspace settings legacy aliases', () => {
  it('declares the aliases the routers must keep', () => {
    const aliases = WORKSPACE_SETTINGS_ALIASES.map((entry) => entry.alias);

    expect(aliases).toContain('creds');
    expect(aliases).toContain('stats');
    // The retired workspace Storage page keeps answering old bookmarks.
    expect(aliases).toContain('storage');
    expect(aliases).toContain('provider');
    expect(aliases).toContain('service-model');
  });

  it.each(surfaces)('%s redirects every alias to its live workspace tab', (_, routes) => {
    for (const { alias, target } of WORKSPACE_SETTINGS_ALIASES) {
      const pathname = `/acme/settings/${alias}`;
      const expected = expectedRedirect(target);

      expect(redirectOf(routes, pathname)?.props?.to, `${pathname} does not redirect`).toBe(
        expected,
      );
    }
  });

  it.each(surfaces)('%s keeps the sub-paths of an alias that declares them', (_, routes) => {
    for (const { alias, subPaths, target } of WORKSPACE_SETTINGS_ALIASES) {
      if (!subPaths) continue;

      const pathname = `/acme/settings/${alias}/client-1`;
      const expected = expectedRedirect(target);

      expect(redirectOf(routes, pathname)?.props?.to, `${pathname} does not redirect`).toBe(
        expected,
      );
    }
  });

  it.each(surfaces)('%s keeps the live tab addressable beside its alias', (_, routes) => {
    // `/acme/settings/credential` is the page; `/acme/settings/creds` is the
    // legacy spelling. Only the first may render — an alias that outranked its
    // own target would make the page unreachable.
    for (const { target } of WORKSPACE_SETTINGS_ALIASES) {
      // Root and absolute (personal-page) targets are not workspace tabs.
      if (target === 'root' || target.startsWith('/')) continue;

      expect(leafOf(routes, `/acme/settings/${target}`)?.path, `${target} is shadowed`).toBe(
        target,
      );
    }
  });

  it.each(surfaces)(
    '%s sends the retired provider and model pages to the personal ones',
    (_, routes) => {
      expect(redirectOf(routes, '/acme/settings/provider')?.props?.to).toBe('/settings/provider');
      expect(redirectOf(routes, '/acme/settings/service-model')?.props?.to).toBe(
        '/settings/service-model',
      );
      // The provider id survives the move.
      const detail = redirectOf(routes, '/acme/settings/provider/openai') as
        { type?: { displayName?: string } } | undefined;
      expect(detail?.type?.displayName).toBe('WorkspaceProviderRedirect');
    },
  );
});
