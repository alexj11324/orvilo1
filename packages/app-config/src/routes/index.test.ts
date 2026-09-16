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
