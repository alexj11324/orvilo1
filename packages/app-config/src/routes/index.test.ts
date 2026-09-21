import { describe, expect, it } from 'vitest';

import {
  DEAD_ROUTE_PREFIXES,
  getNavigableRoutes,
  getRouteById,
  NAVIGATION_ROUTES,
  RESERVED_RETIRED_ROOTS,
  RETIRED_ROUTE_PREFIXES,
} from './index';

describe('NAVIGATION_ROUTES', () => {
  it('assigns a tier to every route', () => {
    for (const route of NAVIGATION_ROUTES) {
      expect(['primary', 'secondary', 'retired']).toContain(route.tier);
    }
  });

  it('keeps retired routes resolvable so legacy links and stored preferences still resolve', () => {
    const retired = NAVIGATION_ROUTES.filter((route) => route.tier === 'retired');

    expect(retired.length).toBeGreaterThan(0);
    for (const route of retired) {
      expect(getRouteById(route.id)).toBeDefined();
    }
  });

  it('carries no command-palette wiring on retired routes', () => {
    // A withdrawn surface has no palette entry, so it must not keep cmdk i18n
    // keys or search keywords — stale pointers would dangle after the locale
    // keys for those entries are removed.
    const retired = NAVIGATION_ROUTES.filter((route) => route.tier === 'retired');

    for (const route of retired) {
      expect(route.cmdkKey).toBeUndefined();
      expect(route.keywordsKey).toBeUndefined();
      expect(route.keywords).toBeUndefined();
    }
  });

  it('keeps command-palette wiring on every navigable route', () => {
    // The palette renders `t(route.cmdkKey)` for every route it offers — a
    // missing key would render an empty label.
    for (const route of getNavigableRoutes()) {
      expect(route.cmdkKey).toBeTruthy();
    }
  });
});

describe('retired root paths', () => {
  it('accounts for every retired prefix as a reserved root or a live one', () => {
    // A retired prefix is either a reserved word the routers guard, or a prefix
    // whose URLs still land on live product (`memory`, `apps`) and therefore
    // already own a route. Anything else would be swallowed by `/:workspaceSlug`
    // as if it were a workspace id.
    const resolved = new Set([...RESERVED_RETIRED_ROOTS, 'memory', 'apps']);

    for (const prefix of RETIRED_ROUTE_PREFIXES) {
      expect(
        resolved.has(prefix.replace(/^\//, '')),
        `${prefix} is neither reserved nor live`,
      ).toBe(true);
    }
  });

  it('reserves the retired roots that no longer have a route of their own', () => {
    // `/video` and `/image` are the two the workbench retirement deleted
    // outright: nothing registers them any more, so without a guard the slug
    // segment claims them.
    expect(RESERVED_RETIRED_ROOTS).toContain('video');
    expect(RESERVED_RETIRED_ROOTS).toContain('image');
    expect(RESERVED_RETIRED_ROOTS).toContain('community');
    expect(RESERVED_RETIRED_ROOTS).toContain('page');
  });

  it('never reserves a path whose URLs still resolve to live product', () => {
    for (const root of RESERVED_RETIRED_ROOTS) {
      expect(DEAD_ROUTE_PREFIXES.has(`/${root}`)).toBe(true);
    }
  });

  it('spells reserved roots as bare segments', () => {
    for (const root of RESERVED_RETIRED_ROOTS) {
      expect(root).toBe(root.replace(/^\//, ''));
      expect(root).not.toContain('/');
      expect(root.length).toBeGreaterThan(0);
    }
  });
});

describe('getNavigableRoutes', () => {
  it('never offers a retired destination', () => {
    const offered = getNavigableRoutes().map((route) => route.id);

    for (const route of NAVIGATION_ROUTES) {
      if (route.tier === 'retired') expect(offered).not.toContain(route.id);
    }
  });

  it('offers the primary working destinations', () => {
    const offered = getNavigableRoutes().map((route) => route.id);

    expect(offered).toContain('workInbox');
    expect(offered).toContain('myWork');
    expect(offered).toContain('tasks');
    expect(offered).toContain('savedViews');
    expect(offered).toContain('teams');
    expect(offered).toContain('project');
    expect(offered).toContain('automations');
  });

  it('keeps secondary destinations reachable', () => {
    const offered = getNavigableRoutes().map((route) => route.id);

    expect(offered).toContain('resource');
  });

  it('leaves settings out, because MainMenu renders it in its own group', () => {
    expect(getNavigableRoutes().map((route) => route.id)).not.toContain('settings');
  });
});
