import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isValidElement, type ReactElement, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { matchRoutes, Navigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import BrandTextLoading from '@/components/Loading/BrandTextLoading';
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
import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import TasksSkeleton from '@/components/Skeleton/Tasks';
import TaskDetailSkeleton from '@/features/AgentTasks/AgentTaskDetail/TaskDetailSkeleton';
import { WORKSPACE_SETTINGS_TABS } from '@/features/Workspace/workspaceAwarePath';
import AppShellSkeleton from '@/spa/BootShell/AppShellSkeleton';
import { createTabRouter } from '@/spa/router/tabRouter';
import { resolveRouteSkeleton } from '@/spa/router/useRouteSkeleton';

import {
  createMainAreaChildren as createWebMainAreaChildren,
  desktopRoutes as webDesktopRoutes,
} from './desktopRouter.config';
import {
  createMainAreaChildren as createElectronMainAreaChildren,
  desktopRoutes as electronDesktopRoutes,
} from './desktopRouter.config.desktop';
import { createMainAreaRouteFactory, ResourceCategorySkeleton } from './desktopRouter.shared';
import WebHomeRedirect from './WebHomeRedirect';

type MainAreaFactory = () => RouteObject[];

const mainAreaVariants: Array<[string, MainAreaFactory]> = [
  ['Web', createWebMainAreaChildren],
  ['Electron', createElectronMainAreaChildren],
];

const createMainAreaRoutes = (factory: MainAreaFactory): RouteObject[] => [
  { children: factory(), path: '/' },
];

const findWorkspaceSettingsRoute = (factory: MainAreaFactory) => {
  const workspaceRoute = factory().find((route) => route.path === ':workspaceSlug');
  return workspaceRoute?.children?.find((route) => route.path === 'settings');
};

const collectPaths = (routes: RouteObject[]): string[] =>
  routes.flatMap((route) =>
    route.path
      ? [route.path, ...collectPaths(route.children ?? [])]
      : collectPaths(route.children ?? []),
  );

const routeShape = (routes: RouteObject[]): unknown =>
  routes.map((route) => ({
    children: route.children ? routeShape(route.children) : undefined,
    index: route.index === true || undefined,
    path: route.path,
  }));

async function readRouterSources() {
  return Promise.all(
    [
      'desktopRouter.shared.tsx',
      'desktopRouter.config.tsx',
      'desktopRouter.config.desktop.tsx',
    ].map((filename) => readFile(path.join(process.cwd(), 'src/spa/router', filename), 'utf8')),
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

  it.each(mainAreaVariants)(
    '%s agent sub-pages declare route meta so tab titles are not bare branding',
    (_, createMainAreaChildren) => {
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
    },
  );

  it.each(mainAreaVariants)('%s keeps legacy agent stats deep-links matching', (_, factory) => {
    const matches = matchRoutes(createMainAreaRoutes(factory), '/agent/agent-1/stats');

    expect(matches?.at(-1)?.route.path).toBe('stats');
  });

  it.each(mainAreaVariants)(
    '%s redirects legacy agent topics deep-links to the agent chat route',
    (_, factory) => {
      const matches = matchRoutes(createMainAreaRoutes(factory), '/agent/agent-1/topics');

      expect(matches?.at(-1)?.route.path).toBe('topics');
      expect(
        (matches?.at(-1)?.route.element as ReactElement<{ to: string }> | undefined)?.props.to,
      ).toBe('..');
    },
  );

  it.each(mainAreaVariants)(
    '%s serves the self-learning experience list and redirects legacy /rules links to it',
    (_, factory) => {
      const routes = createMainAreaRoutes(factory);
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
    },
  );

  it.each(mainAreaVariants)(
    '%s serves self-learning creation as a dedicated page',
    (_, factory) => {
      const matches = matchRoutes(
        createMainAreaRoutes(factory),
        '/agent/agent-1/self-evolving/new',
      );

      expect(matches?.at(-1)?.route.path).toBe('self-evolving/new');
      expect(matches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
      expect(matches?.at(-1)?.params).not.toHaveProperty('domainId');
    },
  );

  it.each(mainAreaVariants)('%s keeps legacy self-learning deep-links matching', (_, factory) => {
    const matches = matchRoutes(
      createMainAreaRoutes(factory),
      '/agent/agent-1/self-learning/domain-1/experience/lesson-1',
    );

    expect(matches?.at(-1)?.route.path).toBe('self-learning/*');
    expect(matches?.at(-1)?.params['*']).toBe('domain-1/experience/lesson-1');
  });

  it.each(mainAreaVariants)(
    '%s exposes the project overview, task, goal, and resource workspaces',
    (_, factory) => {
      const projectRoute = factory().find((route) => route.path === 'project/:projectId');
      const projectIndexRoute = projectRoute?.children?.find((route) => route.index);
      const projectPaths = projectRoute?.children
        ?.map((route) => route.path)
        .filter((routePath): routePath is string => Boolean(routePath));

      // `acceptance` is gone from the project workspace: acceptances are objects
      // under a task, and the project-level collection was a second, parentless
      // way to browse them. The assertion follows the behavior change rather
      // than being relaxed — the list is still compared exactly.
      expect(projectPaths).toEqual([
        'overview',
        'tasks',
        'goals',
        'resources',
        'library/:id',
        'conversation/:topicId?',
      ]);
      // Linear shape: the project index redirects to its issue collection, so
      // the index element must be a Navigate to 'tasks' rather than a page.
      expect(projectIndexRoute?.element).toBeTruthy();
      expect(
        (projectIndexRoute?.element as ReactElement<{ to?: string }> | undefined)?.props.to,
      ).toBe('tasks');
    },
  );

  // The project's resources page links to `/project/:id/library/:id`, so that
  // URL has to resolve — a route module existing under `src/routes` is not on
  // its own reachable, which is how this one went unnoticed.
  it.each(mainAreaVariants)('%s resolves a project resource and its library', (_, factory) => {
    const resources = matchRoutes(createMainAreaRoutes(factory), '/project/prj_1/resources');
    const library = matchRoutes(createMainAreaRoutes(factory), '/project/prj_1/library/kb_1');

    expect(resources?.at(-1)?.route.path).toBe('resources');
    expect(resources?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
    expect(library?.at(-1)?.route.path).toBe('library/:id');
    expect(library?.at(-1)?.params).toMatchObject({ id: 'kb_1', projectId: 'prj_1' });
  });

  it.each(mainAreaVariants)('%s exposes the projects view-all route', (_, factory) => {
    const personalMatches = matchRoutes(createMainAreaRoutes(factory), '/projects');
    const workspaceMatches = matchRoutes(createMainAreaRoutes(factory), '/acme/projects');

    expect(personalMatches?.at(-1)?.route.index).toBe(true);
    expect(personalMatches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
    expect(workspaceMatches?.at(-1)?.route.index).toBe(true);
    expect(workspaceMatches?.at(-1)?.route.handle).toMatchObject({ meta: expect.any(Object) });
  });

  it.each(mainAreaVariants)(
    '%s registers only redirect tombstones for the retired Community and Pages routes',
    (_, factory) => {
      const routes = factory();

      for (const path of ['community', 'page']) {
        const route = routes.find((candidate) => candidate.path === path);

        expect(route?.element).toBeDefined();
        expect(route?.children).toBeUndefined();
      }
    },
  );

  it.each(mainAreaVariants)(
    '%s keeps retired product redirects inside the active workspace',
    (_, factory) => {
      const routes = createMainAreaRoutes(factory);

      for (const pathname of [
        '/community',
        '/community/agent/example',
        '/community/workspace/settings',
        '/page',
        '/page/docs_example',
        '/page/docs_example/permission',
        '/acme/community/agent/example',
        '/acme/page/docs_example',
      ]) {
        const matches = matchRoutes(routes, pathname);
        const redirect = matches?.find(
          ({ route }) =>
            (route.element as ReactElement<{ to?: string }> | undefined)?.props.to === '..',
        );

        expect(
          (redirect?.route.element as ReactElement<{ to: string }> | undefined)?.props.to,
          pathname,
        ).toBe('..');
      }
    },
  );

  it.each(mainAreaVariants)(
    '%s personal memory settings are not shadowed by workspace memory routes',
    (_, factory) => {
      const matches = matchRoutes(createMainAreaRoutes(factory), '/settings/memory');
      const paths = matches?.map((match) => match.route.path);

      expect(paths).toContain('settings');
      expect(paths).not.toContain(':workspaceSlug');
      expect(paths?.at(-1)).toBe('memory');
      expect(matches?.at(-1)?.route.handle).toMatchObject({ settingsTab: 'memory' });
    },
  );

  it('generates identical main-area path and nesting behavior for Web and Electron', () => {
    expect(routeShape(createElectronMainAreaChildren())).toEqual(
      routeShape(createWebMainAreaChildren()),
    );
  });

  it.each(mainAreaVariants)(
    '%s matches work attention surfaces instead of a splat 404',
    (_, factory) => {
      const routes = createMainAreaRoutes(factory);

      for (const [pathname, parent] of [
        ['/inbox', 'inbox'],
        ['/my-work', 'my-work'],
        ['/views', 'views'],
        ['/views/builtin:all', 'views'],
        ['/teams', 'teams'],
        ['/teams/team-1', 'teams'],
        ['/acme/inbox', 'inbox'],
        ['/acme/my-work', 'my-work'],
        ['/acme/views/view-1', 'views'],
        ['/acme/teams/team-1', 'teams'],
      ] as const) {
        const matches = matchRoutes(routes, pathname);
        const paths = matches?.map((match) => match.route.path) ?? [];

        expect(matches, pathname).toBeTruthy();
        expect(paths, pathname).toContain(parent);
        expect(paths, pathname).not.toContain('*');
      }
    },
  );

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
    // The threshold guards against a refactor that pulls route modules back
    // into eager imports; it is not a route count. Retiring the standalone
    // acceptance pages removed their lazy boundaries, so the floor follows the
    // smaller tree instead of being pinned to the pre-retirement number.
    expect(lazyRouteImports.length).toBeGreaterThan(90);
  });

  it('owns prioritized preload registration only in the shared route definition', async () => {
    const [sharedSource, webSource, electronSource] = await readRouterSources();

    expect([...sharedSource.matchAll(/preloadId:\s*'[^']+'/g)].length).toBeGreaterThan(0);
    expect(webSource).not.toContain('preloadId:');
    expect(electronSource).not.toContain('preloadId:');
  });

  it('does not opt Electron out of the post-render route preload scheduler', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src/spa/initialize/routePreload.ts'),
      'utf8',
    );

    expect(source).not.toContain("typeof window === 'undefined' || __ELECTRON__");
  });

  it('keeps platform differences limited to root composition and runtime-only routes', () => {
    const webRoot = webDesktopRoutes.find((route) => route.path === '/');
    const electronRoot = electronDesktopRoutes.find((route) => route.path === '/');
    const webPaths = webDesktopRoutes.map((route) => route.path);
    const electronPaths = electronDesktopRoutes.map((route) => route.path);

    expect(webRoot?.children).toHaveLength(createWebMainAreaChildren().length);
    expect(electronRoot?.children).toMatchObject([
      { element: null, index: true },
      { element: null, path: '*' },
    ]);
    expect(webPaths).toContain('/verify-im');
    // `/share/*` moved to the standalone Share app (apps/share).
    expect(webPaths).not.toContain('/share/t');
    expect(webPaths).not.toContain('/share/page');
    // …and the agent-share visitor surface is no longer defined here: it runs
    // a visitor's conversation on the creator's account, so it ships with the
    // deployment that does that accounting and registers itself through
    // `BusinessDesktopRoutesWithoutMainLayout`.
    expect(webPaths).not.toContain('/a/:slugOrId/:topicId?');
    expect(electronPaths).not.toContain('/a/:slugOrId/:topicId?');
    expect(webPaths).not.toContain('/verify');
    // The standalone `/acceptance` tree was retired with the standalone
    // platform; the root is now reserved and redirects into the task board.
    expect(webPaths).not.toContain('/acceptance');
    expect(webPaths).toContain('/onboarding');
    expect(webPaths).not.toContain('/desktop-onboarding');
    expect(electronPaths).not.toContain('/verify-im');
    expect(electronPaths).not.toContain('/share/t');
    expect(electronPaths).not.toContain('/share/page');
    expect(electronPaths).not.toContain('/verify');
    expect(electronPaths).not.toContain('/acceptance');
    // Both clients mount the unified `/onboarding`; `/desktop-onboarding`
    // survives on Electron only as a compat redirect for legacy links.
    expect(electronPaths).toContain('/onboarding');
    expect(electronPaths).toContain('/desktop-onboarding');
  });

  // The standalone Acceptance / Verify platform is retired. Its two roots must
  // still resolve — not as 404s, and above all not through `/:workspaceSlug`,
  // which would parse a stored `/acceptance/<id>` link as workspace
  // `acceptance`. Both redirect into the main area instead.
  it.each(mainAreaVariants)('%s redirects the retired acceptance/verify roots', (_, factory) => {
    for (const pathname of [
      '/acceptance',
      '/acceptance/acceptance-1',
      '/acceptance/acceptance-1/check/check-1',
      '/verify',
      '/verify/run-1',
    ]) {
      const matches = matchRoutes(createMainAreaRoutes(factory), pathname);
      const last = matches?.at(-1);

      expect(last?.route.path).toMatch(/^(acceptance|verify)\/\*$/);
      expect(last?.params['*']).toBe(pathname.split('/').slice(2).join('/'));
      expect(isValidElement(last?.route.element)).toBe(true);
      expect((last?.route.element as ReactElement<{ to?: string }>).props.to).toBe('/tasks');
    }
  });

  // The two `desktopRoutes` trees are thin platform adapters (Electron replaces
  // its root children with per-tab stubs), so the content tree is read from the
  // shared factory both of them build from.
  it.each(mainAreaVariants)('%s no longer mounts an acceptance page segment', (_, factory) => {
    const paths: string[] = [];
    const walk = (list: RouteObject[]) => {
      for (const route of list) {
        if (typeof route.path === 'string') paths.push(route.path);
        if (route.children) walk(route.children);
      }
    };
    walk(factory());

    expect(paths.filter((routePath) => routePath.includes('acceptance'))).toEqual(['acceptance/*']);
  });

  it.each([
    ['Web', webDesktopRoutes],
    ['Electron', electronDesktopRoutes],
  ])('%s hands the boot shell over to the same skeleton, not the brand logo', (_, routes) => {
    const root = routes.find((route) => route.path === '/');
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

  it.each([
    // Electron's root tree holds only TabHost stubs — its real content routes
    // live in the per-tab memory routers, which build their own tree.
    ['Web', () => webDesktopRoutes.find((route) => route.path === '/')?.children ?? []],
    ['Electron', () => createTabRouter('/').routes[0]?.children ?? []],
  ])(
    '%s main-area routes load behind content or segment feedback, not branding',
    (_, getRoutes) => {
      const fallbacks = collectFallbacks(getRoutes());

      expect(fallbacks.length).toBeGreaterThan(0);
      expect(fallbacks).not.toContain(BrandTextLoading);
      expect(new Set(fallbacks)).toEqual(
        new Set([ConversationLayoutSkeleton, ConversationSegmentSkeleton, RouteSegmentSkeleton]),
      );
    },
  );

  it.each([
    ['Web', (_pathname: string) => webDesktopRoutes],
    ['Electron', (pathname: string) => createTabRouter(pathname).routes],
  ])(
    '%s selects the closest conversation segment feedback for each pending boundary',
    (_, createRuntimeRoutes) => {
      for (const [pathname, expectedFallbacks] of [
        [
          '/agent/agent-1/topic-1',
          [RouteSegmentSkeleton, ConversationLayoutSkeleton, ConversationSegmentSkeleton],
        ],
        ['/group/group-1/topic-1', [RouteSegmentSkeleton, ConversationLayoutSkeleton]],
      ] as const) {
        const matches = matchRoutes(createRuntimeRoutes(pathname), pathname);
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
    },
  );

  it.each([
    ['Web', () => webDesktopRoutes.find((route) => route.path === '/')?.children ?? []],
    ['Electron', () => createTabRouter('/').routes[0]?.children ?? []],
  ])('%s declares a skeleton on every lazy main-area page', (_, getRoutes) => {
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
    walk(getRoutes(), '', []);

    expect(undeclared).toEqual([]);
  });

  it.each([
    ['Web', (_pathname: string) => webDesktopRoutes],
    ['Electron', (pathname: string) => createTabRouter(pathname).routes],
  ])('%s resolves specialized skeletons from the deepest route meta', (_, getRoutes) => {
    for (const [pathname, expectedSkeleton] of [
      ['/agent/agent-1/tasks', TasksSkeleton],
      ['/agent/agent-1/task/task-1', TaskDetailSkeleton],
      ['/agent/agent-1/goals', GoalSkeleton],
      ['/agent/agent-1/goal/goal-1', GoalDetailSkeleton],
      ['/agent/agent-1/profile', ProfileSkeleton],
      ['/agent/agent-1/topic-1', ConversationLayoutSkeleton],
      ['/group/group-1/profile', GroupProfileRouteSkeleton],
      ['/group/group-1/topic-1', ConversationLayoutSkeleton],
      ['/settings/profile', SettingsPageSkeleton],
      ['/memory', MemorySkeleton],
      ['/resource', ResourceHomeSkeleton],
      ['/resource/files', ResourceCategorySkeleton],
      ['/resource/images', ResourceCategorySkeleton],
      ['/resource/works', ResourceCategorySkeleton],
      // Work inbox / My Work / Views / Teams must keep their own list skeletons.
      ['/inbox', createSurfaceSkeleton('list')],
      ['/my-work', createSurfaceSkeleton('list')],
      ['/views', createSurfaceSkeleton('list')],
      ['/teams', createSurfaceSkeleton('list')],
    ] as const) {
      const matches = matchRoutes(getRoutes(pathname), pathname);
      expect(
        resolveRouteSkeleton(matches?.map(({ route }) => ({ handle: route.handle })) ?? []),
        pathname,
      ).toBe(expectedSkeleton);
    }
  });

  it.each([
    ['Web', (_pathname: string) => webDesktopRoutes],
    ['Electron', (pathname: string) => createTabRouter(pathname).routes],
  ])(
    '%s keeps the settings layout and tab chunks on the settings page skeleton',
    (_, getRoutes) => {
      const matches = matchRoutes(getRoutes('/settings/profile'), '/settings/profile');
      const fallbackTypes = matches
        ?.map(
          ({ route }) =>
            (route.element as ReactElement<{ fallback?: ReactElement }> | undefined)?.props.fallback
              ?.type,
        )
        .filter(Boolean);

      expect(fallbackTypes?.slice(-2)).toEqual([RouteSegmentSkeleton, RouteSegmentSkeleton]);
    },
  );

  it.each([
    ['Web', (_pathname: string) => webDesktopRoutes],
    ['Electron', (pathname: string) => createTabRouter(pathname).routes],
  ])('%s redirects retired /apps to the Settings > About downloads', (_, getRoutes) => {
    // `/apps` was retired into Settings > About; the route stays registered as
    // a static redirect so legacy deep-links and stored tab state still land
    // somewhere honest instead of 404ing.
    const matches = matchRoutes(getRoutes('/apps'), '/apps');
    const element = matches?.at(-1)?.route.element as ReactElement<{
      replace?: boolean;
      to?: string;
    }>;

    expect(element?.type).toBe(Navigate);
    expect(element?.props.to).toBe('/settings/about');
    expect(element?.props.replace).toBe(true);
  });

  it('fills each platform index slot with that platform landing element', () => {
    const webChildren = createWebMainAreaChildren();
    const electronChildren = createElectronMainAreaChildren();
    const webWorkspace = webChildren.find((route) => route.path === ':workspaceSlug');
    const electronWorkspace = electronChildren.find((route) => route.path === ':workspaceSlug');

    // `deferPlatformElement` mounts the factory as the element's type, so read
    // through it: the contract is what the slot renders, not which factory
    // closed over it.
    const landingTypes = (children: RouteObject[], workspace?: RouteObject) =>
      [
        children.find((route) => route.index)?.element,
        workspace?.children?.find((route) => route.index)?.element,
      ].map((element) => {
        const factory = (element as ReactElement).type as () => ReactElement;
        return factory().type;
      });

    // Web used to leave both slots empty and render the chat Home beside the
    // outlet instead. Task-first makes the slot the app's landing behaviour, so
    // the workspace tree has to answer it too — otherwise `/:slug` lands on the
    // chat Home while `/` lands on the task list.
    expect(landingTypes(webChildren, webWorkspace)).toEqual([WebHomeRedirect, WebHomeRedirect]);
    // Electron lands its tabs on the same element: each tab owns a memory
    // router, so a fresh `/` (or `/:workspaceSlug`) tab redirects inside that
    // router to the same `/tasks` board Web opens on.
    expect(landingTypes(electronChildren, electronWorkspace)).toEqual([
      WebHomeRedirect,
      WebHomeRedirect,
    ]);
  });

  it('lands an empty Electron tab on the task board while explicit urls keep their route', () => {
    // The tab router is what a new empty tab and a bare-root boot both paint:
    // its index match must be the redirect that lands the tab on `/tasks`,
    // not a second home surface.
    const tabRoutes = createTabRouter('/').routes;
    const indexMatch = matchRoutes(tabRoutes, '/')?.at(-1);
    const indexFactory = (indexMatch?.route.element as ReactElement).type as () => ReactElement;

    expect(indexMatch?.route.index).toBe(true);
    expect(indexFactory().type).toBe(WebHomeRedirect);

    const workspaceMatch = matchRoutes(tabRoutes, '/acme')?.at(-1);
    const workspaceFactory = (workspaceMatch?.route.element as ReactElement)
      .type as () => ReactElement;

    expect(workspaceMatch?.params).toMatchObject({ workspaceSlug: 'acme' });
    expect(workspaceFactory().type).toBe(WebHomeRedirect);

    // An explicit deep link never touches the index slot: the task detail and
    // the tasks board resolve to their own routes.
    expect(matchRoutes(tabRoutes, '/task/task-1')?.at(-1)?.route.path).toBe(':taskId/:slug?');
    expect(matchRoutes(tabRoutes, '/tasks')?.at(-1)?.route.index).toBe(true);
  });

  it.each(mainAreaVariants)(
    '%s registers every workspace-aware settings tab',
    (_, createMainAreaChildren) => {
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
    },
  );

  it.each(mainAreaVariants)(
    '%s redirects retired workspace provider deep-links inside the workspace',
    (_, factory) => {
      const routes = createMainAreaRoutes(factory);
      const listMatches = matchRoutes(routes, '/acme/settings/provider');
      const detailMatches = matchRoutes(routes, '/acme/settings/provider/lobehub');
      const serviceModelMatches = matchRoutes(routes, '/acme/settings/service-model');

      // The provider/service-model pages are retired — deep-links must land on
      // the workspace settings root instead of the `*` catch-all.
      for (const matches of [listMatches, detailMatches, serviceModelMatches]) {
        const leaf = matches?.at(-1)?.route;
        expect((leaf?.element as { props?: { to?: string } } | undefined)?.props?.to).toBe('..');
      }
    },
  );

  it.each(mainAreaVariants)(
    '%s no longer resolves the retired workspace OAuth app routes',
    (_, factory) => {
      const routes = createMainAreaRoutes(factory);

      // The self-built OAuth app console was retired with its workspace mirror
      // (hidden-surface-retirement HS-50). Deep links must stop matching a route
      // of their own instead of landing on a page the product no longer ships.
      for (const pathname of ['/acme/settings/oauth-apps', '/acme/settings/oauth-apps/client-1']) {
        const paths = matchRoutes(routes, pathname)?.map((match) => match.route.path) ?? [];

        expect(paths, `${pathname} still resolves the app list`).not.toContain('oauth-apps');
        expect(paths, `${pathname} still resolves the app detail`).not.toContain('oauth-apps/:sub');
      }
    },
  );

  it.each(mainAreaVariants)(
    '%s keeps serving the creator agent surface on /agent/:aid',
    (_, factory) => {
      const matches = matchRoutes(createMainAreaRoutes(factory), '/agent/agt_1');

      expect(matches?.some((match) => match.route.path === ':aid')).toBe(true);
      expect(matches?.at(-1)?.params).toMatchObject({ aid: 'agt_1' });
    },
  );

  it.each([
    ['Web', webDesktopRoutes],
    ['Electron', electronDesktopRoutes],
  ])('%s leaves the agent-share visitor surface to the business routes', (_, routes) => {
    // The open-source tree no longer defines `/a/*`; a deployment that offers
    // agent sharing contributes it through the business slot, so the path
    // falls through to not-found here.
    expect(matchRoutes(routes, '/a/my-bot')?.at(-1)?.route.path).toBe('*');
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
