import { describe, expect, it } from 'vitest';

import { getNavigableRoutes, getRouteById, NAVIGATION_ROUTES } from './index';

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

describe('getNavigableRoutes', () => {
  it('never offers a retired destination', () => {
    const offered = getNavigableRoutes().map((route) => route.id);

    for (const route of NAVIGATION_ROUTES) {
      if (route.tier === 'retired') expect(offered).not.toContain(route.id);
    }
  });

  it('offers the primary working destinations', () => {
    const offered = getNavigableRoutes().map((route) => route.id);

    expect(offered).toContain('tasks');
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
