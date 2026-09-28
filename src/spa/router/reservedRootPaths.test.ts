import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { RESERVED_RETIRED_ROOTS, RETIRED_ROUTE_PREFIXES } from '@/config/routes';

import { createMainAreaChildren as createWebMainAreaChildren } from './desktopRouter.config';
import { createMainAreaChildren as createElectronMainAreaChildren } from './desktopRouter.config.desktop';
import { mobileRoutes } from './mobileRouter.config';

/**
 * A retired root path is a reserved word.
 *
 * `/:workspaceSlug` sits below the root paths it must not shadow, which only
 * works for a surface that still registers something. The workbench retirements
 * deleted `/image` and `/video` outright, so nothing was left to outrank the
 * slug segment: opening `/video` resolved as *workspace* `video` and answered
 * "no such workspace" — a retired product surface wearing somebody else's 404,
 * on a URL that looks like it could be fixed by creating a workspace by that
 * name. `/agent/:aid` has the same shape one level down.
 *
 * These tests pin the guard for every retired prefix, on every runtime.
 */
type Routes = Parameters<typeof matchRoutes>[0];

const mainAreaRoutes = (children: ReturnType<typeof createWebMainAreaChildren>): Routes => [
  { children, path: '/' },
];

const surfaces: Array<[string, Routes]> = [
  ['Web', mainAreaRoutes(createWebMainAreaChildren())],
  // Electron's root router owns only the tab stubs; its content tree is the
  // same shared definition the Web root mounts.
  ['Electron', mainAreaRoutes(createElectronMainAreaChildren())],
  ['Mobile', mobileRoutes],
];

const leafOf = (routes: Routes, pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route;

const redirectTarget = (routes: Routes, pathname: string) =>
  (leafOf(routes, pathname)?.element as { props?: { to?: string } } | undefined)?.props?.to;

describe('retired root paths are reserved words', () => {
  it.each(surfaces)('%s claims every reserved root with its own route', (_, routes) => {
    expect(RESERVED_RETIRED_ROOTS.length).toBeGreaterThan(0);

    for (const root of RESERVED_RETIRED_ROOTS) {
      // A route of its own, not the slug segment that used to swallow it.
      expect(leafOf(routes, `/${root}`)?.path, `/${root} is not claimed by its own route`).toBe(
        root,
      );
      // And it returns to the scope root rather than to a page nobody asked for.
      expect(redirectTarget(routes, `/${root}`)).toBe('..');
    }
  });

  it.each(surfaces)('%s never parses a retired root as a workspace id', (_, routes) => {
    for (const prefix of RETIRED_ROUTE_PREFIXES) {
      const root = prefix.replace(/^\//, '');

      for (const pathname of [`/${root}`, `/${root}/anything`]) {
        const workspaceMatch = matchRoutes(routes, pathname)?.find(
          (match) => match.params.workspaceSlug,
        );

        expect(workspaceMatch, `${pathname} was resolved as workspace "${root}"`).toBeUndefined();
      }
    }
  });

  it.each(surfaces)('%s keeps the agent segment free to name any id', (_, routes) => {
    // The guards are root-only on purpose. `/agent/<anything>` is an id space,
    // and `/agent/:aid/:topicId` must keep resolving retired words as ids when
    // they appear *below* `agent` — reserving them there would be a different
    // decision, and nothing in the product links a retired surface that way.
    for (const prefix of RETIRED_ROUTE_PREFIXES) {
      const root = prefix.replace(/^\//, '');

      expect(
        matchRoutes(routes, `/agent/${root}`)?.find((match) => match.params.aid),
      ).toMatchObject({ params: { aid: root } });
    }
  });

  it.each(surfaces)('%s still mirrors real workspaces under the slug segment', (_, routes) => {
    // The guard is targeted: it reserves the retired roots, it does not disable
    // the workspace scope.
    expect(matchRoutes(routes, '/acme')?.find((match) => match.params.workspaceSlug)).toBeDefined();
  });

  it.each(surfaces)('%s keeps a retired root unreachable inside a workspace too', (_, routes) => {
    // The guards are part of the shared main-area children, so the workspace
    // scope cannot resurrect the surface either.
    for (const root of RESERVED_RETIRED_ROOTS) {
      const pathname = `/acme/${root}`;

      expect(leafOf(routes, pathname)?.path, `${pathname} is not guarded`).toBe(root);
      expect(redirectTarget(routes, pathname)).toBe('..');
    }
  });
});
