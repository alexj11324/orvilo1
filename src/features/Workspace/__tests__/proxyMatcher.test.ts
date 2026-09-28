import * as getPageStaticInfo from 'next/dist/build/analysis/get-page-static-info';
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher';
import type { RouteObject } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { config } from '@/proxy';
import { createMainAreaChildren } from '@/spa/router/desktopRouter.config';

vi.mock('@/libs/next/proxy/define-config', () => ({
  defineConfig: () => ({ middleware: vi.fn() }),
}));

/**
 * The matcher in `src/proxy.ts` decides which URLs the Next proxy rewrites to
 * the SPA. It grew piecemeal, so workspace-scoped URLs like
 * `/{workspaceSlug}/settings/members` or `/{slug}/tasks` — and root routes like
 * `/projects` and `/inbox` — were never added: the middleware skipped them, no
 * Next route exists for them, and direct navigation 404ed on production while
 * client-side SPA navigation kept working. Like `reservedSegments.test.ts`,
 * this walks the router rather than a hand-copied list, so a new segment fails
 * here the day it lands without a matcher entry.
 */

// `getMiddlewareMatchers` exists at runtime but is absent from the module's
// .d.ts, so it is pulled off the namespace import with a local signature.
const { getMiddlewareMatchers } = getPageStaticInfo as unknown as {
  getMiddlewareMatchers: (
    matcher: string | string[],
    nextConfig: object,
  ) => getPageStaticInfo.ProxyMatcher[];
};

// Compile the matcher with Next's real compiler — the same code `next build`
// runs against `config.matcher`.
const match = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));

// `MiddlewareRouteMatch` only needs header/cookie getters — a plain stub stands
// in for a NextRequest.
const reqStub = {
  cookies: { get: () => undefined, has: () => false },
  headers: { get: () => null },
} as unknown as Parameters<typeof match>[1];

const matches = (pathname: string): boolean => match(pathname, reqStub, {});

/**
 * Same walk as `reservedSegments.test.ts`: a route with a `path` claims its
 * first segment and its children are no longer top level; a route without one
 * is a wrapper, so its children still are. `*` catch-alls and `:`-param routes
 * claim no enumerable segment.
 */
const staticTopLevelSegments = (routes: RouteObject[] = []): string[] =>
  routes.flatMap((route) => {
    const { path } = route;
    if (typeof path !== 'string') return staticTopLevelSegments(route.children ?? []);
    if (path === '*' || path.startsWith(':')) return [];
    return [path.split('/')[0]];
  });

const mainAreaChildren = createMainAreaChildren();
const rootSegments = [...new Set(staticTopLevelSegments(mainAreaChildren))];

// The `/:workspaceSlug` route's children are the shared main-area mirror plus
// the workspace-only `settings` and `billing` subtrees.
const workspaceRoute = mainAreaChildren.find((route) => route.path === ':workspaceSlug');
const workspaceSegments = [...new Set(staticTopLevelSegments(workspaceRoute?.children ?? []))];

describe('proxy matcher coverage', () => {
  it('reads real segments from the router, so it can fail', () => {
    // Guards the guard: empty walks would pass vacuously below.
    expect(rootSegments.length).toBeGreaterThan(5);
    expect(workspaceSegments.length).toBeGreaterThan(5);
  });

  it('matches every static top-level segment the main area routes', () => {
    const missed = rootSegments.filter(
      (segment) => !matches(`/${segment}`) || !matches(`/${segment}/child`),
    );

    expect(missed).toEqual([]);
  });

  it('matches every segment mounted under /:workspaceSlug', () => {
    const missed = workspaceSegments.filter(
      (segment) => !matches(`/e2e-ws/${segment}`) || !matches(`/e2e-ws/${segment}/child`),
    );

    expect(missed).toEqual([]);
  });
});
