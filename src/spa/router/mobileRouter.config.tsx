'use client';

import type { RouteObject } from 'react-router';

import {
  BusinessMobileRoutesWithMainLayout,
  BusinessMobileRoutesWithoutMainLayout,
} from '@/business/client/BusinessMobileRoutes';
import { RETIRED_ROUTE_PREFIXES } from '@/config/routes';
import { mobileAgentSettingsRouteMeta } from '@/features/RouteMeta/mobileRouteMeta';
import { agentRouteMeta } from '@/routes/(main)/agent/features/routeMeta';
import { loadRouteWithBuiltinToolSurfaces } from '@/spa/initialize/toolSurfaces';
import {
  leafElement,
  leafGroupRoute,
  mobileLeafPreloadId,
  sharedAgentsLeafGroup,
  sharedAgentTaskLeaf,
  type SharedLeafGroup,
  sharedRetiredDeepGuards,
  type SharedRouteLeaf,
  sharedTaskWorkspaceLeafGroups,
  sharedWorkspaceSettingsAliasRoutes,
  type SharedWorkspaceSettingsLeaf,
  sharedWorkspaceSettingsLeaves,
  sharedWorkspaceSettingsRedirects,
} from '@/spa/router/sharedMainAreaLeaves';
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

const mobileLeaf = (leaf: SharedRouteLeaf) =>
  leafElement(leaf, `Mobile > ${leaf.name}`, mobileLeafPreloadId(leaf));

const mobileWorkspaceSettingsLeaf = (leaf: SharedWorkspaceSettingsLeaf): RouteObject => ({
  element: leafElement(leaf, `Mobile > Workspace > Settings > ${leaf.name}`),
  path: leaf.path,
});

/**
 * Shared leaf groups the mobile bundle intentionally does not serve. A new
 * shared leaf fails the coverage test until it is either mapped here or
 * consciously added to this list.
 */
const mobileExcludedLeafGroups = new Set([
  'drafts', // task drafts live in the desktop bundle only
  'goal', // no mobile goal detail page
]);

// Mobile-only group: the agent-scoped task detail `/agent/:aid/task/:taskId`.
const mobileAgentTaskGroup: SharedLeafGroup = {
  children: [
    {
      leaf: { ...sharedAgentTaskLeaf, name: 'Agent Task Detail' },
      path: ':aid/task/:taskId/:slug?',
    },
  ],
  key: 'agent-task',
  path: 'agent',
  resetPath: '../tasks',
};

const mobileTaskWorkspaceGroups: SharedLeafGroup[] = [
  ...sharedTaskWorkspaceLeafGroups.filter((group) => !mobileExcludedLeafGroups.has(group.key)),
  mobileAgentTaskGroup,
];

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
  ...sharedRetiredDeepGuards,
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
  leafGroupRoute(sharedAgentsLeafGroup, mobileLeaf, false),

  // Task workspace routes (cross-agent)
  {
    children: mobileTaskWorkspaceGroups.map((group) => leafGroupRoute(group, mobileLeaf, false)),
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
          // mobile workspace sidebar is follow-up work. The leaf set mirrors
          // the desktop table: every tab the workspace settings nav links to
          // must resolve here, or the root catch-all bounces it home.
          {
            children: [
              { element: redirectElement('general'), index: true },
              ...sharedWorkspaceSettingsAliasRoutes,
              ...sharedWorkspaceSettingsRedirects,
              ...sharedWorkspaceSettingsLeaves.map(mobileWorkspaceSettingsLeaf),
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
