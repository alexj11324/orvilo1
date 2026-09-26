'use client';

import type { RouteObject } from 'react-router';

import {
  BusinessMobileRoutesWithMainLayout,
  BusinessMobileRoutesWithoutMainLayout,
} from '@/business/client/BusinessMobileRoutes';
import { RETIRED_ROUTE_PREFIXES } from '@/config/routes';
import { WORKSPACE_SETTINGS_ALIASES } from '@/config/routes/settings';
import { mobileAgentSettingsRouteMeta } from '@/features/RouteMeta/mobileRouteMeta';
import { agentRouteMeta } from '@/routes/(main)/agent/features/routeMeta';
import { loadRouteWithBuiltinToolSurfaces } from '@/spa/initialize/toolSurfaces';
import { dynamicElement, dynamicLayout, ErrorBoundary, redirectElement } from '@/utils/router';

/**
 * Mobile mirrors the desktop shared tree minus the surfaces it does not serve,
 * so it has to reserve more of the retired roots than the desktop tree does.
 * `/memory` has no mobile route at all — the preferences manager is where the
 * retired browsing centre left it, and mobile never had one — which would leave
 * the slug segment free to claim it. `/apps` keeps its own redirect below, so it
 * is the one retired prefix that already has a route here.
 */
const mobileRetiredRootGuards = [...RETIRED_ROUTE_PREFIXES]
  .map((prefix) => prefix.replace(/^\//, ''))
  .filter((root) => root !== 'apps');

const mobileChatElement = dynamicElement(
  () => loadRouteWithBuiltinToolSurfaces(() => import('@/routes/(mobile)/chat')),
  'Mobile > Chat',
  { preloadId: 'mobile-agent' },
);

/**
 * Children shared between `/` and `/:workspaceSlug` for mobile. Mobile only
 * mirrors the subset of routes it actually supports — settings / me / default
 * home stay personal-only.
 */
export const sharedMainAreaChildren: RouteObject[] = [
  // Retired roots come first: they are the paths a dynamic segment would
  // otherwise claim as a workspace id. Derived from the navigation registry, so
  // retiring a route reserves its root on mobile too.
  ...mobileRetiredRootGuards.map((path): RouteObject => ({
    element: redirectElement('..'),
    path,
  })),
  // Deeper URLs of the retired Community and standalone Pages surfaces.
  ...[
    ...[
      'agent',
      'group_agent',
      'mcp',
      'model',
      'provider',
      'skill',
      'user',
      'org',
      'workspace',
    ].flatMap((type) => [`community/${type}`, `community/${type}/:slug`]),
    'community/workspace/settings',
    'page/:id',
    'page/:id/permission',
  ].map((path): RouteObject => ({ element: redirectElement('..'), path })),
  {
    element: redirectElement('..'),
    path: 'community/*',
  },
  {
    element: redirectElement('..'),
    path: 'page/*',
  },
  // Chat routes
  {
    children: [
      {
        element: redirectElement('..'),
        index: true,
      },
      {
        children: [
          {
            element: mobileChatElement,
            handle: { meta: agentRouteMeta },
            index: true,
          },
          // Legacy `/agent/:aid/topics` URLs — the management page is gone,
          // keep deep-links landing on the agent chat instead of a phantom
          // `topics` topic. Same guard as the desktop router.
          {
            element: redirectElement('..'),
            path: 'topics',
          },
          {
            element: mobileChatElement,
            handle: { meta: agentRouteMeta },
            path: ':topicId',
          },
          {
            element: dynamicElement(
              () => import('@/routes/(mobile)/chat/settings'),
              'Mobile > Chat > Settings',
            ),
            handle: { meta: mobileAgentSettingsRouteMeta },
            path: 'settings',
          },
        ],
        element: dynamicLayout(
          () => import('@/routes/(mobile)/chat/_layout'),
          'Mobile > Chat > Layout',
          { preloadId: 'mobile-agent' },
        ),
        errorElement: <ErrorBoundary />,
        path: ':aid',
      },
    ],
    path: 'agent',
  },

  // Agents view-all route (flat list of workspace/private agents)
  {
    children: [
      {
        element: dynamicElement(() => import('@/routes/(main)/agents'), 'Mobile > Agents', {
          preloadId: 'mobile-agents',
        }),
        index: true,
      },
    ],
    errorElement: <ErrorBoundary resetPath=".." />,
    path: 'agents',
  },

  // Task workspace routes (cross-agent)
  {
    children: [
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/tasks'), 'Mobile > Tasks', {
              preloadId: 'mobile-tasks',
            }),
            index: true,
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'tasks',
      },
      {
        children: [
          {
            element: dynamicElement(
              () => import('@/routes/(main)/task/[taskId]'),
              'Mobile > Task Detail',
            ),
            // Optional readable title tail; `:taskId` alone resolves the task.
            path: ':taskId/:slug?',
          },
        ],
        errorElement: <ErrorBoundary resetPath="../tasks" />,
        path: 'task',
      },
      {
        children: [
          {
            element: dynamicElement(
              () => import('@/routes/(main)/agent/task/[taskId]'),
              'Mobile > Agent Task Detail',
            ),
            path: ':aid/task/:taskId/:slug?',
          },
        ],
        errorElement: <ErrorBoundary resetPath="../tasks" />,
        path: 'agent',
      },
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/inbox'), 'Mobile > Inbox', {
              preloadId: 'mobile-inbox',
            }),
            index: true,
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'inbox',
      },
      {
        children: [
          {
            element: dynamicElement(
              () => import('@/routes/(main)/my-issues'),
              'Mobile > My Issues',
              {
                preloadId: 'mobile-my-work',
              },
            ),
            index: true,
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'my-issues',
      },
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/my-work'), 'Mobile > My Work', {
              preloadId: 'mobile-my-work',
            }),
            index: true,
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'my-work',
      },
      {
        element: dynamicElement(() => import('@/routes/(main)/reviews'), 'Mobile > Reviews', {
          preloadId: 'mobile-reviews',
        }),
        errorElement: <ErrorBoundary resetPath=".." />,
        // Keep queue pagination/scroll mounted while only the selected review changes.
        path: 'reviews/:reviewId?',
      },
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/members'), 'Mobile > Members', {
              preloadId: 'mobile-members',
            }),
            index: true,
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'members',
      },
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/views'), 'Mobile > Views', {
              preloadId: 'mobile-views',
            }),
            index: true,
          },
          {
            element: dynamicElement(
              () => import('@/routes/(main)/views/[viewId]'),
              'Mobile > Saved View',
              { preloadId: 'mobile-views' },
            ),
            path: ':viewId',
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'views',
      },
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(main)/teams'), 'Mobile > Teams', {
              preloadId: 'mobile-teams',
            }),
            index: true,
          },
          {
            element: dynamicElement(
              () => import('@/routes/(main)/teams/[teamId]'),
              'Mobile > Team',
              { preloadId: 'mobile-teams' },
            ),
            path: ':teamId',
          },
        ],
        errorElement: <ErrorBoundary resetPath=".." />,
        path: 'teams',
      },
    ],
    element: dynamicLayout(
      () => import('@/routes/(main)/(task-workspace)/_layout'),
      'Mobile > Task Workspace > Layout',
      { preloadId: 'mobile-tasks' },
    ),
  },

  ...BusinessMobileRoutesWithMainLayout,
];

// Mobile router configuration (declarative mode)
export const mobileRoutes: RouteObject[] = [
  {
    children: [
      ...sharedMainAreaChildren,

      // Retired: `/apps` folded into Settings > About (kept as a redirect so
      // legacy deep-links still land somewhere honest).
      {
        element: redirectElement('/settings/about'),
        path: 'apps',
      },

      // Settings routes (personal-only — never mirrored under /:workspaceSlug)
      {
        children: [
          {
            element: dynamicElement(
              () => import('@/routes/(mobile)/settings'),
              'Mobile > Settings',
              { preloadId: 'mobile-settings' },
            ),
            index: true,
          },
          // Retired LLM Provider surface — legacy deep-links land on the settings root.
          {
            element: redirectElement('/settings'),
            path: 'provider',
          },
          {
            element: redirectElement('/settings'),
            path: 'provider/:providerId',
          },
          {
            element: redirectElement('/settings/credential'),
            path: 'creds',
          },
          // Other settings tabs (common, agent, memory, tts, about, etc.)
          {
            element: dynamicElement(
              () => import('@/routes/(main)/settings'),
              'Mobile > Settings > Tab',
              { preloadId: 'mobile-settings' },
            ),
            path: ':tab',
          },
          {
            element: dynamicElement(
              () => import('@/routes/(main)/settings'),
              'Mobile > Settings > Tab > Sub',
              { preloadId: 'mobile-settings' },
            ),
            path: ':tab/:sub',
          },
        ],
        element: dynamicLayout(
          () => import('@/routes/(mobile)/settings/_layout'),
          'Mobile > Settings > Layout',
          { preloadId: 'mobile-settings' },
        ),
        errorElement: <ErrorBoundary />,
        path: 'settings',
      },

      // Me routes (mobile personal center — never mirrored under /:workspaceSlug)
      {
        children: [
          {
            children: [
              {
                element: dynamicElement(
                  () => import('@/routes/(mobile)/me/(home)'),
                  'Mobile > Me > Home',
                ),
                index: true,
              },
            ],
            element: dynamicLayout(
              () => import('@/routes/(mobile)/me/(home)/layout'),
              'Mobile > Me > Home > Layout',
            ),
          },
          {
            children: [
              {
                element: dynamicElement(
                  () => import('@/routes/(mobile)/me/profile'),
                  'Mobile > Me > Profile',
                ),
                path: 'profile',
              },
            ],
            element: dynamicLayout(
              () => import('@/routes/(mobile)/me/profile/layout'),
              'Mobile > Me > Profile > Layout',
            ),
          },
          {
            children: [
              {
                element: dynamicElement(
                  () => import('@/routes/(mobile)/me/settings'),
                  'Mobile > Me > Settings',
                ),
                path: 'settings',
              },
            ],
            element: dynamicLayout(
              () => import('@/routes/(mobile)/me/settings/layout'),
              'Mobile > Me > Settings > Layout',
            ),
          },
        ],
        errorElement: <ErrorBoundary />,
        path: 'me',
      },

      // Default route - home page
      {
        children: [
          {
            element: dynamicElement(() => import('@/routes/(mobile)/(home)/'), 'Mobile > Home', {
              preloadId: 'mobile-home',
            }),
            index: true,
          },
        ],
        element: dynamicLayout(
          () => import('@/routes/(mobile)/(home)/_layout'),
          'Mobile > Home > Layout',
          { preloadId: 'mobile-home' },
        ),
      },

      // Workspace slug routes — `/:workspaceSlug/*` mirrors the shared main area.
      // Must come AFTER all reserved root paths so they don't shadow e.g. /agent.
      {
        children: [
          // Workspace home — handled by the persistent home layout (mirrors
          // how `/` index is empty); rendering here would duplicate Home.
          {
            index: true,
          },
          ...sharedMainAreaChildren,
          // Workspace settings — `/:slug/settings/*`. Mobile reuses the mobile
          // settings chrome (header + content wrapper) for now; a dedicated
          // mobile workspace sidebar is follow-up work.
          {
            children: [
              { element: redirectElement('general'), index: true },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/general'),
                  'Mobile > Workspace > Settings > General',
                ),
                path: 'general',
              },
              // Account-level tabs mirrored inside the workspace (see the
              // desktop router); the pages are the personal settings pages.
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/profile'),
                  'Mobile > Workspace > Settings > Profile',
                ),
                path: 'profile',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/appearance'),
                  'Mobile > Workspace > Settings > Appearance',
                ),
                path: 'appearance',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/hotkey'),
                  'Mobile > Workspace > Settings > Hotkey',
                ),
                path: 'hotkey',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/advanced'),
                  'Mobile > Workspace > Settings > Advanced',
                ),
                path: 'advanced',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/labs'),
                  'Mobile > Workspace > Settings > Labs',
                ),
                path: 'labs',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/about'),
                  'Mobile > Workspace > Settings > About',
                ),
                path: 'about',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/members'),
                  'Mobile > Workspace > Settings > Members',
                ),
                path: 'members',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/notification'),
                  'Mobile > Workspace > Settings > Notification',
                ),
                path: 'notification',
              },
              // Channel detail level of the two-level notification settings —
              // the page reads the channel id from the `sub` route param.
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/notification'),
                  'Mobile > Workspace > Settings > Notification > Channel',
                ),
                path: 'notification/:sub',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/labels'),
                  'Mobile > Workspace > Settings > Labels',
                ),
                path: 'labels',
              },
              {
                element: redirectElement('..'),
                path: 'provider',
              },
              {
                // The legacy sync/import page is retired. Mobile has no
                // replacement importer route, so return to workspace settings.
                element: redirectElement('..'),
                path: 'linear',
              },
              // Legacy `/<slug>/settings/<alias>` deep links, from the same
              // registry the desktop router reads.
              ...WORKSPACE_SETTINGS_ALIASES.flatMap(
                ({ alias, subPaths, target }): RouteObject[] => {
                  const element = redirectElement(target === 'root' ? '..' : `../${target}`);
                  return [
                    { element, path: alias },
                    ...(subPaths ? [{ element, path: `${alias}/:sub` }] : []),
                  ];
                },
              ),
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/plans'),
                  'Mobile > Workspace > Settings > Plans',
                ),
                path: 'plans',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/billing'),
                  'Mobile > Workspace > Settings > Billing',
                ),
                path: 'billing',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/budget'),
                  'Mobile > Workspace > Settings > Budget',
                ),
                path: 'budget',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/credits'),
                  'Mobile > Workspace > Settings > Credits',
                ),
                path: 'credits',
              },
              {
                element: dynamicElement(
                  () => import('@/routes/(main)/[workspaceSlug]/settings/usage'),
                  'Mobile > Workspace > Settings > Usage',
                ),
                path: 'usage',
              },
            ],
            element: dynamicLayout(
              () => import('@/routes/(mobile)/settings/_layout'),
              'Mobile > Workspace > Settings > Layout',
            ),
            errorElement: <ErrorBoundary />,
            path: 'settings',
          },
          // Legacy `/:slug/billing/*` URLs — redirect to `/:slug/settings/*`.
          {
            children: [
              { element: redirectElement('../settings/plans'), path: 'plans' },
              { element: redirectElement('../settings/usage'), path: 'usage' },
              { element: redirectElement('../settings/credits'), path: 'credits' },
              { element: redirectElement('../settings/billing'), path: 'billing' },
            ],
            path: 'billing',
          },
        ],
        element: dynamicLayout(
          () => import('@/routes/(main)/[workspaceSlug]/_layout'),
          'Mobile > Workspace > Layout',
        ),
        errorElement: <ErrorBoundary />,
        path: ':workspaceSlug',
      },

      // Retired standalone Acceptance / Verify platform — both roots must stay
      // reserved words so `/:workspaceSlug` cannot claim `acceptance` /
      // `verify`; the acceptance a stored link pointed at is reachable from
      // the task board.
      {
        element: redirectElement('/tasks'),
        path: 'acceptance/*',
      },
      {
        element: redirectElement('/tasks'),
        path: 'verify/*',
      },

      // Catch-all route
      {
        element: redirectElement('/'),
        path: '*',
      },
    ],
    element: dynamicLayout(() => import('@/routes/(mobile)/_layout'), 'Mobile > Main > Layout'),
    errorElement: <ErrorBoundary />,
    path: '/',
  },
  // Onboarding route (outside main layout)
  {
    element: dynamicElement(() => import('@/routes/onboarding'), 'Mobile > Onboarding'),
    errorElement: <ErrorBoundary />,
    path: '/onboarding',
  },
  ...BusinessMobileRoutesWithoutMainLayout,
];
