import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ReactElement } from 'react';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mobileRoutes } from './mobileRouter.config';

describe('mobileRouter agent share route', () => {
  it('leaves the agent-share visitor surface to the business routes', () => {
    // Agent sharing runs a visitor's conversation on the creator's account, so
    // the surface ships with the deployment that does that accounting and
    // registers itself through `BusinessMobileRoutesWithoutMainLayout`.
    // Nothing claims `/a/*` any more, so it falls through to not-found.
    expect(matchRoutes(mobileRoutes, '/a/my-agent')?.at(-1)?.route.path).toBe('*');
  });

  it('keeps the creator agent surface on /agent/:aid', () => {
    const matches = matchRoutes(mobileRoutes, '/agent/my-agent');

    expect(matches?.some((match) => match.route.path === ':aid')).toBe(true);
    expect(matches?.at(-1)?.params).toMatchObject({ aid: 'my-agent' });
  });

  it('redirects legacy agent topics deep-links to the agent chat route', () => {
    const matches = matchRoutes(mobileRoutes, '/agent/my-agent/topics');

    // Without the literal `topics` redirect, the URL would match `:topicId`
    // and mount chat on a phantom `topics` topic.
    expect(matches?.at(-1)?.route.path).toBe('topics');
    expect(
      (matches?.at(-1)?.route.element as ReactElement<{ to: string }> | undefined)?.props.to,
    ).toBe('..');
  });
});

describe('mobileRouter task routes', () => {
  it('registers task list and detail routes under the shared workspace layout', async () => {
    const [source, leavesSource] = await Promise.all(
      ['mobileRouter.config.tsx', 'sharedMainAreaLeaves.tsx'].map((filename) =>
        readFile(path.join(process.cwd(), 'src/spa/router', filename), 'utf8'),
      ),
    );

    expect(source).toContain("import('@/routes/(main)/(task-workspace)/_layout')");
    // Task-workspace leaves are declared once in the shared leaf registry —
    // both routers map them to their own elements.
    expect(leavesSource).toContain("import('@/routes/(main)/tasks')");
    expect(leavesSource).toContain("import('@/routes/(main)/task/[taskId]')");
    expect(leavesSource).toContain("import('@/routes/(main)/agent/task/[taskId]')");
    expect(leavesSource).toContain("path: 'tasks'");
    expect(leavesSource).toContain("path: 'task'");
    expect(leavesSource).toContain("path: 'inbox'");
    expect(leavesSource).toContain("path: 'my-work'");
    expect(leavesSource).toContain("path: 'views'");
    expect(leavesSource).toContain("path: 'teams'");
    // The `:slug?` tail is the readable title segment; it never resolves the
    // task, so pre-slug links keep matching the same route.
    expect(leavesSource).toContain("path: ':taskId/:slug?'");
    expect(source).toContain("path: ':aid/task/:taskId/:slug?'");
    expect(leavesSource).not.toContain("import('@/routes/(main)/tasks/_layout')");
  });
});

describe('mobileRouter workspace provider routes', () => {
  it('registers workspace provider list and path-shaped deep-link redirect', async () => {
    // The workspace settings leaves live in the shared registry — both routers
    // derive their provider routes from it.
    const leaves = await readFile(
      path.join(process.cwd(), 'src/spa/router/sharedMainAreaLeaves.tsx'),
      'utf8',
    );
    const config = await readFile(
      path.join(process.cwd(), 'src/spa/router/mobileRouter.config.tsx'),
      'utf8',
    );

    // Without these, workspace-aware provider links (`/:slug/settings/provider/:id`)
    // fall through to the mobile `*` route and kick the user out of the workspace.
    expect(leaves).toContain("import('@/routes/(main)/[workspaceSlug]/settings/provider')");
    // The mobile route must use the mobile variant, otherwise the page renders
    // the desktop 280px provider menu layout on phones.
    expect(leaves).toContain('m.WorkspaceProviderSettingMobile');
    // The redirect is statically imported: lazy-loading it would flash the
    // generic brand loader before redirecting.
    expect(leaves).toContain("from '@/features/WorkspaceSetting/ProviderRedirect'");
    expect(leaves).toContain("path: 'provider'");
    expect(leaves).toContain("path: 'provider/:providerId'");
    // Mobile registers the shared leaves through its mobile-chrome mapper.
    expect(config).toContain('sharedWorkspaceSettingsLeaves.map(mobileWorkspaceSettingsLeaf)');
  });
});

it('redirects the legacy mobile Linear page to the Linear import tab', () => {
  const leaf = matchRoutes(mobileRoutes, '/acme/settings/linear')?.at(-1)?.route;

  expect(leaf?.path).toBe('linear');
  expect((leaf?.element as ReactElement<{ to: string }> | undefined)?.props.to).toBe(
    '../imports/linear',
  );
});

describe('mobile retired product routes', () => {
  it.each(['/community', '/community/agent/example', '/page', '/page/document-id'])(
    'redirects retired route %s home',
    (pathname) => {
      const matches = matchRoutes(mobileRoutes, pathname);
      const redirect = matches?.find(
        ({ route }) =>
          (route.element as { props?: { to?: string } } | undefined)?.props?.to === '..',
      )?.route;

      expect(redirect).toBeDefined();
      expect((redirect?.element as { props: { to: string } }).props.to).toBe('..');
    },
  );

  it.each(['/acme/community/agent/example', '/acme/page/document-id'])(
    'keeps retired route %s inside the active workspace',
    (pathname) => {
      const redirect = matchRoutes(mobileRoutes, pathname)?.find(
        ({ route }) =>
          (route.element as { props?: { to?: string } } | undefined)?.props?.to === '..',
      )?.route;

      expect((redirect?.element as { props: { to: string } }).props.to).toBe('..');
    },
  );
});

// The standalone Acceptance / Verify platform is retired. Its two roots must
// stay reserved words on mobile too: without a route of their own, `/acceptance`
// and `/verify` would be parsed as workspace slugs and `/acceptance/<id>` would
// answer "no such workspace" instead of landing on the task board.
describe('mobileRouter retired acceptance/verify roots', () => {
  it.each([
    '/acceptance',
    '/acceptance/acceptance-1',
    '/acceptance/acceptance-1/check/check-1',
    '/verify',
    '/verify/run-1',
  ])('claims retired root %s with its own route, not the slug segment', (pathname) => {
    const leaf = matchRoutes(mobileRoutes, pathname)?.at(-1)?.route;

    expect(leaf?.path).toMatch(/^(acceptance|verify)\/\*$/);
    expect((leaf?.element as { props?: { to?: string } } | undefined)?.props?.to).toBe('/tasks');
  });
});

// The Chat bottom tab navigates `/agent` -> `..` -> `/{slug}` on mobile. The
// `/:workspaceSlug` index used to declare `{ index: true }` with no element,
// so `WorkspaceSlugBoundary` rendered an empty `<Outlet/>` and the tab came
// up all-white.
describe('mobileRouter workspace home', () => {
  it('mounts a home element at /:workspaceSlug', () => {
    const leaf = matchRoutes(mobileRoutes, '/my-workspace')?.at(-1)?.route;

    expect(leaf?.index).toBe(true);
    expect(leaf?.element).toBeTruthy();
  });

  it('mounts the same home element shape as the root / index', () => {
    const rootLeaf = matchRoutes(mobileRoutes, '/')?.at(-1)?.route;
    const slugLeaf = matchRoutes(mobileRoutes, '/my-workspace')?.at(-1)?.route;

    expect(rootLeaf?.index).toBe(true);
    expect(rootLeaf?.element).toBeTruthy();
    // Both index leaves resolve through the same lazy element factory —
    // `/{slug}` must render the same MobileHome surface as `/`.
    expect((slugLeaf?.element as { type?: unknown }).type).toBe(
      (rootLeaf?.element as { type?: unknown }).type,
    );
  });
});
