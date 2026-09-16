import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isValidElement, type ReactElement, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { matchRoutes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import BrandTextLoading from '@/components/Loading/BrandTextLoading';
import AppsSkeleton from '@/components/Skeleton/Apps';
import ConversationLayoutSkeleton from '@/components/Skeleton/Conversation/Layout';
import ConversationSegmentSkeleton from '@/components/Skeleton/Conversation/Segment';
import DelayedFallback from '@/components/Skeleton/Delayed';
import GoalSkeleton from '@/components/Skeleton/Goal';
import GoalDetailSkeleton from '@/components/Skeleton/GoalDetail';
import MemorySkeleton from '@/components/Skeleton/Memory';
import ProfileSkeleton, { GroupProfileRouteSkeleton } from '@/components/Skeleton/Profile';
import ResourceHomeSkeleton from '@/components/Skeleton/ResourceHome';
import RouteSegmentSkeleton from '@/components/Skeleton/RouteSegment';
import SettingsPageSkeleton from '@/components/Skeleton/Settings/Page';
import TasksSkeleton from '@/components/Skeleton/Tasks';
import TopicsSkeleton from '@/components/Skeleton/Topics';
import TaskDetailSkeleton from '@/features/AgentTasks/AgentTaskDetail/TaskDetailSkeleton';
import { WORKSPACE_SETTINGS_TABS } from '@/features/Workspace/workspaceAwarePath';
import AppShellSkeleton from '@/spa/BootShell/AppShellSkeleton';
import { createTabRouter } from '@/spa/router/tabRouter';
import { resolveRouteSkeleton } from '@/spa/router/useRouteSkeleton';

import { createMainAreaChildren, desktopRoutes } from './desktopRouter.config';
import { createMainAreaRouteFactory, ResourceCategorySkeleton } from './desktopRouter.shared';

const createMainAreaRoutes = (factory: () => RouteObject[]): RouteObject[] => [
  { children: factory(), path: '/' },
];

const findWorkspaceSettingsRoute = (factory: () => RouteObject[]) => {
  const workspaceRoute = factory().find((route) => route.path === ':workspaceSlug');
  return workspaceRoute?.children?.find((route) => route.path === 'settings');
};

const collectPaths = (routes: RouteObject[]): string[] =>
  routes.flatMap((route) =>
    route.path
      ? [route.path, ...collectPaths(route.children ?? [])]
      : collectPaths(route.children ?? []),
  );

async function readRouterSources() {
  return Promise.all(
    ['desktopRouter.shared.tsx', 'desktopRouter.config.tsx'].map((filename) =>
      readFile(path.join(process.cwd(), 'src/spa/router', filename), 'utf8'),
    ),
  );
}

describe('desktop router shared definition', () => {
  it('defers platform route factories until React renders their route elements', () => {
    const createHomeElement = vi.fn(() => <div>Home</div>);
    const createWorkspaceSettingsIndexElement = vi.fn(() => <div>Workspace settings</div>);
    const createRoutes = createMainAreaRouteFactory({
      createHomeElement,
      createWorkspaceSettingsIndexElement,
    });
    const routes = createRoutes();

    expect(createHomeElement).not.toHaveBeenCalled();
    expect(createWorkspaceSettingsIndexElement).not.toHaveBeenCalled();

    const rootHome = routes.find((route) => route.index);
    const workspace = routes.find((route) => route.path === ':workspaceSlug');
    const workspaceHome = workspace?.children?.find((route) => route.index);
    const workspaceSettings = workspace?.children?.find((route) => route.path === 'settings');
    const workspaceSettingsIndex = workspaceSettings?.children?.find((route) => route.index);

    expect((rootHome?.element as ReactElement).type).toBe(createHomeElement);
    expect((workspaceHome?.element as ReactElement).type).toBe(createHomeElement);
    expect((workspaceSettingsIndex?.element as ReactElement).type).toBe(
      createWorkspaceSettingsIndexElement,
    );
  });

  it('agent sub-pages declare route meta so tab titles are not bare branding', () => {
    for (const pathname of [
      '/agent/agent-1/profile',
      '/agent/agent-1/channel',
      '/agent/agent-1/channel/slack',
      '/agent/agent-1/statistics',
      '/agent/agent-1/share',
      '/group/group-1/profile',
    ]) {
      const matches = matchRoutes(createMainAreaRoutes(createMainAreaChildren), pathname);
      const meta = matches
        ?.map((match) => (match.route.handle as { meta?: unknown } | undefined)?.meta)
        .findLast(Boolean);

      expect(matches, `${pathname} must match a route`).toBeTruthy();
      expect(meta, `${pathname} must declare handle.meta`).toBeDefined();
    }
  });

  it('keeps legacy agent stats deep-links matching', () => {
    const matches = matchRoutes(
      createMainAreaRoutes(createMainAreaChildren),
      '/agent/agent-1/stats',
    );

    expect(matches?.at(-1)?.route.path).toBe('stats');
  });

  it('serves the self-learning experience list and redirects legacy /rules links to it', () => {
    const routes = createMainAreaRoutes(createMainAreaChildren);
    const listMatches = matchRoutes(routes, '/agent/agent-1/self-evolving/domain-1/experience');
    const lessonMatches = matchRoutes(
      routes,
      '/agent/agent-1/self-evolving/domain-1/experience/lesson-1',
    );
    const rulesMatches = matchRoutes(routes, '/agent/agent-1/self-evolving/domain-1/rules');
    const legacyLessonMatches = matchRoutes(
      routes,
      '/agent/agent-1/self-evolving/domain-1/rules/lesson-1',
    );

    expect(listMatches?.at(-1)?.route.path).toBe('experience');
    expect(listMatches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
    expect(lessonMatches?.at(-1)?.route.path).toBe('experience/:lessonId');
    expect(lessonMatches?.at(-1)?.params).toMatchObject({
      domainId: 'domain-1',
      lessonId: 'lesson-1',
    });
    // Legacy deep-links: `/rules` redirects relative to the domain route, i.e. to
    // `/self-evolving/:domainId/experience`; `/rules/:lessonId` keeps its own redirect page.
    expect(rulesMatches?.at(-1)?.route.path).toBe('rules');
    expect(
      (rulesMatches?.at(-1)?.route.element as ReactElement<{ to: string }> | undefined)?.props.to,
    ).toBe('../experience');
    expect(rulesMatches?.at(-2)?.pathname).toBe('/agent/agent-1/self-evolving/domain-1');
    expect(legacyLessonMatches?.at(-1)?.route.path).toBe('rules/:lessonId');
  });

  it('serves self-learning creation as a dedicated page', () => {
    const matches = matchRoutes(
      createMainAreaRoutes(createMainAreaChildren),
      '/agent/agent-1/self-evolving/new',
    );

    expect(matches?.at(-1)?.route.path).toBe('self-evolving/new');
    expect(matches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
    expect(matches?.at(-1)?.params).not.toHaveProperty('domainId');
  });

  it('keeps legacy self-learning deep-links matching', () => {
    const matches = matchRoutes(
      createMainAreaRoutes(createMainAreaChildren),
      '/agent/agent-1/self-learning/domain-1/experience/lesson-1',
    );

    expect(matches?.at(-1)?.route.path).toBe('self-learning/*');
    expect(matches?.at(-1)?.params['*']).toBe('domain-1/experience/lesson-1');
  });

  it('exposes project task, goal, and acceptance workspaces', () => {
    const projectRoute = createMainAreaChildren().find(
      (route) => route.path === 'project/:projectId',
    );
    const projectIndexRoute = projectRoute?.children?.find((route) => route.index);
    const projectPaths = projectRoute?.children
      ?.map((route) => route.path)
      .filter((routePath): routePath is string => Boolean(routePath));

    expect(projectPaths).toEqual(['tasks', 'goals', 'acceptance']);
    expect((projectIndexRoute?.element as ReactElement<{ to: string }> | undefined)?.props.to).toBe(
      'tasks',
    );
  });

  it('exposes the projects view-all route', () => {
    const personalMatches = matchRoutes(createMainAreaRoutes(createMainAreaChildren), '/projects');
    const workspaceMatches = matchRoutes(
      createMainAreaRoutes(createMainAreaChildren),
      '/acme/projects',
    );

    expect(personalMatches?.at(-1)?.route.index).toBe(true);
    expect(personalMatches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
    expect(workspaceMatches?.at(-1)?.route.index).toBe(true);
    expect(workspaceMatches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
  });

  it('personal memory settings are not shadowed by workspace memory routes', () => {
    const matches = matchRoutes(createMainAreaRoutes(createMainAreaChildren), '/settings/memory');
    const paths = matches?.map((match) => match.route.path);

    expect(paths).toContain('settings');
    expect(paths).not.toContain(':workspaceSlug');
    expect(paths?.at(-1)).toBe('memory');
    expect(matches?.at(-1)?.route.handle).toMatchObject({ settingsTab: 'memory' });
  });

  it('keeps all route modules behind lazy import boundaries', async () => {
    const sources = await readRouterSources();
    const combinedSource = sources.join('\n');
    const eagerDefaultRouteImports = [
      ...combinedSource.matchAll(/^import\s+[A-Z]\w*\s+from\s+'@\/routes\//gm),
    ];
    const lazyRouteImports = [
      ...combinedSource.matchAll(
        /(?:dynamicElement|dynamicLayout)\(\s*\(\) => (?:loadRouteWithBuiltinToolSurfaces\(\(\) => )?import\(['"]@\/routes\//g,
      ),
    ];

    expect(eagerDefaultRouteImports).toHaveLength(0);
    expect(combinedSource).not.toContain(
      "import { ProviderDetailPage, ProviderLayout } from '@/routes/(main)/settings/provider'",
    );
    expect(lazyRouteImports.length).toBeGreaterThan(100);
  });

  it('owns prioritized preload registration only in the shared route definition', async () => {
    const [sharedSource, configSource] = await readRouterSources();

    expect([...sharedSource.matchAll(/preloadId:\s*'[^']+'/g)].length).toBeGreaterThan(0);
    expect(configSource).not.toContain('preloadId:');
  });

  it('does not opt Electron out of the post-render route preload scheduler', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src/spa/initialize/routePreload.ts'),
      'utf8',
    );

    expect(source).not.toContain("typeof window === 'undefined' || __ELECTRON__");
  });

  it('keeps the root to TabHost stubs and registers the standalone routes beside it', () => {
    const root = desktopRoutes.find((route) => route.path === '/');
    const paths = desktopRoutes.map((route) => route.path);

    // Page content is mounted by per-tab memory routers, so the root owns only
    // the persistent TabHost shell.
    expect(root?.children).toMatchObject([
      { element: null, index: true },
      { element: null, path: '*' },
    ]);
    expect(paths).toContain('/desktop-onboarding');
    expect(paths).toContain('/verify-im');
    expect(paths).toContain('/acceptance');
    // The browser SPA owned `/onboarding`; the desktop app has its own.
    expect(paths).not.toContain('/onboarding');
    // `/share/*` moved out with the standalone Share app.
    expect(paths).not.toContain('/share/t');
    expect(paths).not.toContain('/share/page');
    expect(paths).not.toContain('/verify');
    // The agent-share visitor surface is not defined here: it runs a visitor's
    // conversation on the creator's account, so it ships with the deployment
    // that does that accounting and registers itself through
    // `BusinessDesktopRoutesWithoutMainLayout`.
    expect(paths).not.toContain('/a/:slugOrId/:topicId?');
  });

  it('hands the boot shell over to the app-shell skeleton, not the brand logo', () => {
    const root = desktopRoutes.find((route) => route.path === '/');
    const { fallback } = (root?.element as ReactElement<{ fallback: ReactElement }>).props;

    expect(fallback.type).toBe(AppShellSkeleton);
  });

  // `dynamicElement` / `dynamicLayout` wrap each route element in their own
  // Suspense, which always beats an outlet-level boundary — so without the
  // rewrite the brand wordmark reappears inside the container for 1–2s on a
  // cold deep link, right after the boot shell hands over.
  // Page-level fallbacks sit behind the 200ms gate, so the skeleton under test
  // is the gate's child rather than the fallback element itself.
  const fallbackType = (fallback?: ReactElement): unknown => {
    if (!fallback) return undefined;
    if (fallback.type !== DelayedFallback) return fallback.type;

    return (fallback.props as { children: ReactElement }).children.type;
  };

  const collectFallbacks = (list: RouteObject[]): unknown[] => {
    const fallbacks: unknown[] = [];
    const walk = (routes: RouteObject[]) => {
      for (const route of routes) {
        const element = route.element as ReactElement<{ fallback?: ReactElement }> | undefined;
        if (element?.props?.fallback) fallbacks.push(fallbackType(element.props.fallback));
        if (route.children) walk(route.children);
      }
    };
    walk(list);
    return fallbacks;
  };

  // The root tree holds only TabHost stubs — the real content routes live in
  // the per-tab memory routers, which build their own tree.
  const getTabContentRoutes = () => createTabRouter('/').routes[0]?.children ?? [];
  const getTabRoutes = (pathname: string) => createTabRouter(pathname).routes;

  it('main-area routes load behind content or segment feedback, not branding', () => {
    {
      const fallbacks = collectFallbacks(getTabContentRoutes());

      expect(fallbacks.length).toBeGreaterThan(0);
      expect(fallbacks).not.toContain(BrandTextLoading);
      expect(new Set(fallbacks)).toEqual(
        new Set([ConversationLayoutSkeleton, ConversationSegmentSkeleton, RouteSegmentSkeleton]),
      );
    }
  });

  it('selects the closest conversation segment feedback for each pending boundary', () => {
    {
      for (const [pathname, expectedFallbacks] of [
        [
          '/agent/agent-1/topic-1',
          [RouteSegmentSkeleton, ConversationLayoutSkeleton, ConversationSegmentSkeleton],
        ],
        ['/group/group-1/topic-1', [RouteSegmentSkeleton, ConversationLayoutSkeleton]],
      ] as const) {
        const matches = matchRoutes(getTabRoutes(pathname), pathname);
        const fallbackTypes = matches
          ?.map(({ route }) =>
            fallbackType(
              (route.element as ReactElement<{ fallback?: ReactElement }> | undefined)?.props
                .fallback,
            ),
          )
          .filter(Boolean);

        expect(fallbackTypes?.slice(-expectedFallbacks.length), pathname).toEqual(
          expectedFallbacks,
        );
      }
    }
  });

  it('declares a skeleton on every lazy main-area page', () => {
    const undeclared: string[] = [];
    const walk = (routes: RouteObject[], base: string, chain: RouteObject[]) => {
      for (const route of routes) {
        const pathname = route.index ? `${base}/(index)` : `${base}/${route.path ?? ''}`;
        const nextChain = [...chain, route];
        if (route.children?.length) {
          walk(route.children, route.index ? base : pathname, nextChain);
          continue;
        }
        const isLazyPage = isValidElement(route.element) && route.element.type === Suspense;
        if (isLazyPage && !resolveRouteSkeleton(nextChain)) undeclared.push(pathname);
      }
    };
    walk(getTabContentRoutes(), '', []);

    expect(undeclared).toEqual([]);
  });

  it('resolves specialized skeletons from the deepest route meta', () => {
    for (const [pathname, expectedSkeleton] of [
      ['/agent/agent-1/topics', TopicsSkeleton],
      ['/agent/agent-1/tasks', TasksSkeleton],
      ['/agent/agent-1/task/task-1', TaskDetailSkeleton],
      ['/agent/agent-1/goals', GoalSkeleton],
      ['/agent/agent-1/goal/goal-1', GoalDetailSkeleton],
      ['/agent/agent-1/profile', ProfileSkeleton],
      ['/agent/agent-1/topic-1', ConversationLayoutSkeleton],
      ['/group/group-1/profile', GroupProfileRouteSkeleton],
      ['/group/group-1/topic-1', ConversationLayoutSkeleton],
      ['/settings/profile', SettingsPageSkeleton],
      ['/apps', AppsSkeleton],
      ['/memory', MemorySkeleton],
      ['/resource', ResourceHomeSkeleton],
      ['/resource/files', ResourceCategorySkeleton],
      ['/resource/images', ResourceCategorySkeleton],
      ['/resource/works', ResourceCategorySkeleton],
    ] as const) {
      const matches = matchRoutes(getTabRoutes(pathname), pathname);
      expect(
        resolveRouteSkeleton(matches?.map(({ route }) => ({ handle: route.handle })) ?? []),
        pathname,
      ).toBe(expectedSkeleton);
    }
  });

  it('keeps the settings layout and tab chunks on the settings page skeleton', () => {
    {
      const matches = matchRoutes(getTabRoutes('/settings/profile'), '/settings/profile');
      const fallbackTypes = matches
        ?.map(
          ({ route }) =>
            (route.element as ReactElement<{ fallback?: ReactElement }> | undefined)?.props.fallback
              ?.type,
        )
        .filter(Boolean);

      expect(fallbackTypes?.slice(-2)).toEqual([RouteSegmentSkeleton, RouteSegmentSkeleton]);
    }
  });

  it('keeps /apps on the route-segment fallback', () => {
    const matches = matchRoutes(getTabRoutes('/apps'), '/apps');
    const fallbackTypes = matches
      ?.map(
        ({ route }) =>
          (route.element as ReactElement<{ fallback?: ReactElement }> | undefined)?.props.fallback
            ?.type,
      )
      .filter(Boolean);

    expect(fallbackTypes?.at(-1)).toBe(RouteSegmentSkeleton);
  });

  it('injects Home into the per-tab content routes', () => {
    const children = createMainAreaChildren();
    const workspace = children.find((route) => route.path === ':workspaceSlug');

    // The bare shared factory leaves the index element empty; this adapter fills
    // it, because each Electron tab owns an independent memory router.
    expect(children.find((route) => route.index)?.element).toBeDefined();
    expect(workspace?.children?.find((route) => route.index)?.element).toBeDefined();
    expect(createMainAreaRouteFactory()().find((route) => route.index)?.element).toBeUndefined();
  });

  // Regression: making this file the Electron adapter first pulled
  // `DesktopHomeRoute` in statically, which drags the whole Home page graph
  // (~770 src modules) into a module ~29 files under `src/` import. Since
  // neither tsgo nor vitest applies the `platformResolve` plugin, every test
  // file touching the router paid for it and the app suite went from ~13min to
  // over 85min in CI. Home stays behind `desktopHomeElement`, whose `.desktop`
  // variant carries the eager version for the renderer build alone.
  it('keeps the Home page graph out of the router config resolved by tsgo and vitest', async () => {
    const [, configSource] = await readRouterSources();

    expect(configSource).not.toContain("from './DesktopHomeRoute'");
    expect(configSource).toContain("from './desktopHomeElement'");

    const eagerVariant = await readFile(
      path.join(process.cwd(), 'src/spa/router/desktopHomeElement.desktop.tsx'),
      'utf8',
    );
    const lazyBase = await readFile(
      path.join(process.cwd(), 'src/spa/router/desktopHomeElement.tsx'),
      'utf8',
    );

    // The renderer build keeps Home eager; the base module must not.
    expect(eagerVariant).toContain("from './DesktopHomeRoute'");
    expect(lazyBase).not.toContain("from './DesktopHomeRoute'");
    expect(lazyBase).toContain("import('./DesktopHomeRoute')");
  });

  it('registers every workspace-aware settings tab', () => {
    const settingsRoute = findWorkspaceSettingsRoute(createMainAreaChildren);
    const registeredTabs = [
      ...new Set(
        collectPaths(settingsRoute?.children ?? []).map(
          (registeredPath) => registeredPath.split('/')[0],
        ),
      ),
    ].sort();

    expect(settingsRoute, 'Workspace settings route must exist').toBeDefined();
    expect(registeredTabs).toEqual([...WORKSPACE_SETTINGS_TABS].sort());
  });

  it('keeps workspace provider deep-links inside the workspace', () => {
    const routes = createMainAreaRoutes(createMainAreaChildren);
    const listMatches = matchRoutes(routes, '/acme/settings/provider');
    const detailMatches = matchRoutes(routes, '/acme/settings/provider/lobehub');

    expect(listMatches?.at(-1)?.route.path).toBe('provider');
    // Before the redirect route existed, the detail path fell through to the
    // root catch-all (`*`) and kicked the user out of the workspace.
    expect(detailMatches?.at(-1)?.route.path).toBe('provider/:providerId');
    expect(detailMatches?.at(-1)?.params).toMatchObject({
      providerId: 'lobehub',
      workspaceSlug: 'acme',
    });
  });

  it('registers workspace OAuth app list and detail routes', () => {
    const routes = createMainAreaRoutes(createMainAreaChildren);
    const listMatches = matchRoutes(routes, '/acme/settings/oauth-apps');
    const detailMatches = matchRoutes(routes, '/acme/settings/oauth-apps/client-1');

    expect(listMatches?.at(-1)?.route.path).toBe('oauth-apps');
    expect(detailMatches?.at(-1)?.route.path).toBe('oauth-apps/:sub');
    expect(detailMatches?.at(-1)?.params).toMatchObject({
      sub: 'client-1',
      workspaceSlug: 'acme',
    });
  });

  it('keeps serving the creator agent surface on /agent/:aid', () => {
    const matches = matchRoutes(createMainAreaRoutes(createMainAreaChildren), '/agent/agt_1');

    expect(matches?.some((match) => match.route.path === ':aid')).toBe(true);
    expect(matches?.at(-1)?.params).toMatchObject({ aid: 'agt_1' });
  });

  it('leaves the agent-share visitor surface to the business routes', () => {
    // The open-source tree no longer defines `/a/*`; a deployment that offers
    // agent sharing contributes it through the business slot, so the path
    // falls through to not-found here.
    expect(matchRoutes(desktopRoutes, '/a/my-bot')?.at(-1)?.route.path).toBe('*');
  });

  it('keeps business resource and task routes in the shared definition', async () => {
    const [sharedSource] = await readRouterSources();

    expect(sharedSource).toContain('...BusinessResourceRoutes');
    expect(sharedSource).toContain("import('@/routes/(main)/(task-workspace)/_layout')");
    expect(sharedSource).toContain("import('@/routes/(main)/agent/task/[taskId]')");
    expect(sharedSource).not.toContain("import('@/routes/(main)/task-workspace/_layout')");
    expect(sharedSource).not.toContain("import('@/routes/(main)/tasks/_layout')");
    expect(sharedSource).not.toContain("import('@/routes/(main)/task/_layout')");
  });
});
