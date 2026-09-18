/** @vitest-environment node */
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it, vi } from 'vitest';

import { config } from './proxy';

vi.mock('@/libs/next/proxy/define-config', () => ({
  defineConfig: () => ({ middleware: vi.fn() }),
}));

const doesMatch = (pathname: string) =>
  unstable_doesMiddlewareMatch({ config, url: `http://localhost:3010${pathname}` });

describe('SPA proxy route matching', () => {
  it('exposes a non-empty literal matcher', () => {
    // Guards the guards: an empty matcher would let the negative assertions
    // below pass vacuously.
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  it.each(['/a/shared-agent', '/a/e2e-missing-share', '/a/shared-agent?hl=en-US'])(
    'routes %s through the SPA proxy',
    (pathname) => {
      expect(doesMatch(pathname)).toBe(true);
    },
  );

  it.each([
    '/community',
    '/community/agent/example',
    '/page',
    '/page/docs_example/permission',
    '/acme/community/org/example',
    '/acme/page/docs_example',
  ])('routes retired product URL %s through the SPA tombstones', (pathname) => {
    expect(doesMatch(pathname)).toBe(true);
  });

  // Top-level SPA segments that existed in the router but were missing here —
  // direct loads 404ed even though client-side navigation rendered them.
  it.each([
    '/automations',
    '/automations/new',
    '/inbox',
    '/project',
    '/project/proj_1',
    '/projects',
    '/agents',
    '/agents/anything',
    '/memory',
    '/memory/preferences',
  ])('routes root SPA path %s through the SPA proxy', (pathname) => {
    expect(doesMatch(pathname)).toBe(true);
  });

  // Every segment the router mounts under `/:workspaceSlug` — the shared
  // main-area mirror plus the workspace-only `settings`/`billing` subtrees.
  // `/acc-ws/settings/members` and `/acc-ws/tasks` 404ed in production because
  // only `community` and `page` had workspace-scoped entries.
  it.each([
    '/e2e-ws/agent',
    '/e2e-ws/agent/agt_1',
    '/e2e-ws/agents',
    '/e2e-ws/automations',
    '/e2e-ws/billing/plans',
    '/e2e-ws/community/org/example',
    '/e2e-ws/eval',
    '/e2e-ws/goal/goal_1',
    '/e2e-ws/group/grp_1',
    '/e2e-ws/image',
    '/e2e-ws/inbox',
    '/e2e-ws/memory',
    '/e2e-ws/page/docs_1',
    '/e2e-ws/project/proj_1',
    '/e2e-ws/projects',
    '/e2e-ws/resource',
    '/e2e-ws/settings',
    '/e2e-ws/settings/members',
    '/e2e-ws/task/task_1',
    '/e2e-ws/tasks',
    '/e2e-ws/video',
  ])('routes workspace-scoped SPA path %s through the SPA proxy', (pathname) => {
    expect(doesMatch(pathname)).toBe(true);
  });

  it.each(['/api/chat', '/trpc/lambda/share.getSharedAgent', '/webapi/chat'])(
    'keeps backend authentication in the handler for %s',
    (pathname) => {
      expect(doesMatch(pathname)).toBe(false);
    },
  );

  it.each([
    '/manifest.json',
    '/robots.txt',
    '/favicon.ico',
    '/_next/static/chunk.js',
    '/api/v1/anything',
    '/trpc/lambda.someProc',
    '/webapi/anything',
    '/market/oidc/handoff',
    '/market/user/me',
  ])('does not match file, build-asset or backend path %s', (pathname) => {
    expect(doesMatch(pathname)).toBe(false);
  });

  it('leaves workspace home unmatched on purpose', () => {
    // A bare `/:workspaceSlug` entry would cover `/e2e-ws` but also parse
    // `/manifest.json` as slug `manifest` + transport suffix `.json`, so
    // workspace home stays a known limitation and segments are enumerated
    // explicitly instead.
    expect(doesMatch('/e2e-ws')).toBe(false);
  });
});
