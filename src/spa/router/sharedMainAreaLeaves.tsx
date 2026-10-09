'use client';

import type { ComponentType, ReactElement } from 'react';
import type { RouteObject } from 'react-router';

import type { SurfaceSkeletonVariant } from '@/components/Skeleton/Surface';
import { WORKSPACE_SETTINGS_ALIASES } from '@/config/routes/settings';
import { goalDetailRouteMeta } from '@/features/AgentGoals/routeMeta';
import { taskRouteMeta, tasksRouteMeta } from '@/features/AgentTasks/routeMeta';
import { agentsRouteMeta } from '@/features/AgentViewAll/routeMeta';
import { membersRouteMeta } from '@/features/Members/routeMeta';
import { myWorkRouteMeta } from '@/features/MyWork/routeMeta';
import { reviewsRouteMeta } from '@/features/Reviews/routeMeta';
import { savedViewsRouteMeta } from '@/features/SavedViews/routeMeta';
import { taskDraftsRouteMeta } from '@/features/TaskDrafts/routeMeta';
import { inboxRouteMeta } from '@/features/WorkInbox/routeMeta';
import WorkspaceProviderRedirect from '@/features/WorkspaceSetting/ProviderRedirect';
import { teamsRouteMeta } from '@/features/WorkTeams/routeMeta';
import type { RouteMeta } from '@/spa/router/routeMeta';
import { dynamicElement, ErrorBoundary, redirectElement } from '@/utils/router';

/**
 * Leaf pages every router mounts: one registry of (path, name, page module,
 * route meta, preload id) that Web, Electron and mobile each wrap in their own
 * element chrome.
 *
 * This registry exists because the two router files used to hand-copy these
 * tables — and they drifted: workspace settings tabs added on desktop never
 * reached mobile, and the links to them fell through to the `*` catch-all and
 * bounced home. Add a leaf once here and every runtime serves it; a platform
 * that legitimately cannot serve a leaf opts out explicitly (see the mobile
 * config's `mobileExcludedLeafGroups` and the shared-leaf coverage test).
 */
export interface SharedRouteLeaf {
  /** Page module — the same file every platform lazy-loads. */
  load: () => Promise<{ default: ComponentType<any> } | ComponentType<any>>;
  /** Desktop-only route meta; mobile mounts no handle. */
  meta?: RouteMeta;
  /** Display name — platforms prefix it with their own label ('Desktop > X'). */
  name: string;
  /** Desktop preload id. Mobile derives `mobile-${preloadId}` from it. */
  preloadId?: string;
}

export const leafElement = (
  leaf: SharedRouteLeaf,
  label: string,
  preloadId?: string,
): ReactElement => dynamicElement(leaf.load, label, preloadId ? { preloadId } : undefined);

export const mobileLeafPreloadId = (leaf: SharedRouteLeaf) =>
  leaf.preloadId ? `mobile-${leaf.preloadId}` : undefined;

/**
 * A group of leaf children under one path — the shell (`{children,
 * errorElement, path}`) is identical on both platforms.
 */
export interface SharedLeafGroup {
  /** Child mounts: the index slot or a literal path segment inside the group. */
  children?: { leaf: SharedRouteLeaf; index?: true; path?: string }[];
  /** Direct mount: element on the route itself, no children (e.g. reviews). */
  direct?: { leaf: SharedRouteLeaf; path: string };
  /** Stable identity used by the mobile exclusion list and the coverage test. */
  key: string;
  /** Group path ('tasks', 'views'); omit for direct mounts. */
  path?: string;
  /** ErrorBoundary resetPath — defaults to '..'. */
  resetPath?: string;
}

/** One child route built from a leaf — index slot or literal path segment. */
export const leafChildRoute = (
  leaf: SharedRouteLeaf,
  element: ReactElement,
  mount: { index: true } | { path: string },
  withMeta = true,
): RouteObject => ({
  ...(withMeta && leaf.meta ? { handle: { meta: leaf.meta } } : {}),
  element,
  ...mount,
});

const leafChild = (
  { leaf, index, path }: NonNullable<SharedLeafGroup['children']>[number],
  element: ReactElement,
  withMeta: boolean,
): RouteObject =>
  leafChildRoute(leaf, element, index ? { index: true } : { path: path! }, withMeta);

/** Builds one `SharedLeafGroup` into the RouteObject both platforms share. */
export const leafGroupRoute = (
  group: SharedLeafGroup,
  elementFor: (leaf: SharedRouteLeaf) => ReactElement,
  withMeta = true,
): RouteObject => {
  const resetPath = group.resetPath ?? '..';

  if (group.direct) {
    const { leaf, path } = group.direct;
    return {
      ...(withMeta && leaf.meta ? { handle: { meta: leaf.meta } } : {}),
      element: elementFor(leaf),
      errorElement: <ErrorBoundary resetPath={resetPath} />,
      path,
    };
  }

  return {
    children: (group.children ?? []).map((child) =>
      leafChild(child, elementFor(child.leaf), withMeta),
    ),
    errorElement: <ErrorBoundary resetPath={resetPath} />,
    path: group.path,
  };
};

// Deeper URLs of the retired Community and standalone Pages surfaces — the
// same literal guards on both platforms.
export const sharedRetiredDeepGuards: RouteObject[] = [
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
    'community/*',
    'page/*',
  ].map((path) => ({ element: redirectElement('..'), path })),
];

/** `/agents` — flat list of workspace/private agents. */
export const sharedAgentsLeafGroup: SharedLeafGroup = {
  children: [
    {
      index: true,
      leaf: {
        load: () => import('@/routes/(main)/agents'),
        meta: agentsRouteMeta,
        name: 'Agents',
        preloadId: 'agents',
      },
    },
  ],
  key: 'agents',
  path: 'agents',
};

/**
 * Leaf groups inside the task-workspace layout (`/tasks`, `/inbox`,
 * `/my-issues`, `/my-work`, `/reviews`, `/members`, `/views`, `/teams`,
 * `/task/*`, `/goal/*`, `/drafts`).
 */
export const sharedTaskWorkspaceLeafGroups: SharedLeafGroup[] = [
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/tasks'),
          meta: tasksRouteMeta,
          name: 'Tasks',
          preloadId: 'tasks',
        },
      },
    ],
    key: 'tasks',
    path: 'tasks',
  },
  // Work inbox: first-class attention surface.
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/inbox'),
          meta: inboxRouteMeta,
          name: 'Inbox',
          preloadId: 'inbox',
        },
      },
    ],
    key: 'inbox',
    path: 'inbox',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/drafts'),
          meta: taskDraftsRouteMeta,
          name: 'Drafts',
          preloadId: 'tasks',
        },
      },
    ],
    key: 'drafts',
    path: 'drafts',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/my-issues'),
          meta: myWorkRouteMeta,
          name: 'My Issues',
          preloadId: 'my-work',
        },
      },
    ],
    key: 'my-issues',
    path: 'my-issues',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/my-work'),
          meta: myWorkRouteMeta,
          name: 'My Work',
          preloadId: 'my-work',
        },
      },
    ],
    key: 'my-work',
    path: 'my-work',
  },
  // One route identity owns list and detail: changing `reviewId` must not
  // remount ReviewsPage and discard queue tails or scroll position.
  {
    direct: {
      leaf: {
        load: () => import('@/routes/(main)/reviews'),
        meta: reviewsRouteMeta,
        name: 'Reviews',
        preloadId: 'reviews',
      },
      path: 'reviews/:reviewId?',
    },
    key: 'reviews',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/members'),
          meta: membersRouteMeta,
          name: 'Members',
          preloadId: 'members',
        },
      },
    ],
    key: 'members',
    path: 'members',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/views'),
          meta: savedViewsRouteMeta,
          name: 'Views',
          preloadId: 'views',
        },
      },
      {
        leaf: {
          load: () => import('@/routes/(main)/views/[viewId]'),
          meta: savedViewsRouteMeta,
          name: 'Saved View',
          preloadId: 'views',
        },
        path: ':viewId',
      },
    ],
    key: 'views',
    path: 'views',
  },
  {
    children: [
      {
        index: true,
        leaf: {
          load: () => import('@/routes/(main)/teams'),
          meta: teamsRouteMeta,
          name: 'Teams',
          preloadId: 'teams',
        },
      },
      {
        leaf: {
          load: () => import('@/routes/(main)/teams/[teamId]'),
          meta: teamsRouteMeta,
          name: 'Team',
          preloadId: 'teams',
        },
        path: ':teamId',
      },
    ],
    key: 'teams',
    path: 'teams',
  },
  {
    children: [
      {
        leaf: {
          load: () => import('@/routes/(main)/task/[taskId]'),
          meta: taskRouteMeta,
          name: 'Task Detail',
        },
        // `:slug?` is the readable title tail (Linear-style): `:taskId` alone
        // resolves the task, so the optional segment keeps pre-slug links.
        path: ':taskId/:slug?',
      },
    ],
    key: 'task',
    path: 'task',
    resetPath: '../tasks',
  },
  {
    children: [
      {
        leaf: {
          load: () => import('@/routes/(main)/goal/[goalId]'),
          meta: goalDetailRouteMeta,
          name: 'Goal Detail',
        },
        path: ':goalId',
      },
    ],
    key: 'goal',
    path: 'goal',
    resetPath: '../tasks',
  },
];

/** Agent-scoped task detail — both platforms serve it under different parents. */
export const sharedAgentTaskLeaf: SharedRouteLeaf = {
  load: () => import('@/routes/(main)/agent/task/[taskId]'),
  meta: taskRouteMeta,
  name: 'Task Detail',
};

/**
 * `/:slug/settings/*` leaves — the table the workspace settings nav links to.
 * Desktop renders `fullBleed` tabs outside the padded content layout and the
 * rest inside it; mobile mounts every leaf flat under its settings chrome.
 * The bounce bug lived here: adding a leaf on one side only meant its link
 * fell through to the catch-all.
 */
export interface SharedWorkspaceSettingsLeaf extends SharedRouteLeaf {
  /** Full-bleed tabs own their internal layout (no padded content wrapper). */
  fullBleed?: boolean;
  /** Mobile-specific page module when the page exposes a mobile variant. */
  loadMobile?: SharedRouteLeaf['load'];
  path: string;
  /** Skeleton surface the desktop route meta registers. */
  skeleton: SurfaceSkeletonVariant;
}

export const sharedWorkspaceSettingsLeaves: SharedWorkspaceSettingsLeaf[] = [
  {
    fullBleed: true,
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/provider'),
    loadMobile: () =>
      import('@/routes/(main)/[workspaceSlug]/settings/provider').then((m) => ({
        default: m.WorkspaceProviderSettingMobile,
      })),
    name: 'Provider',
    path: 'provider',
    skeleton: 'list',
  },
  {
    fullBleed: true,
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/connector'),
    name: 'Connector',
    path: 'connector',
    skeleton: 'list',
  },
  {
    fullBleed: true,
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/imports'),
    name: 'Imports',
    path: 'imports',
    skeleton: 'list',
  },
  {
    fullBleed: true,
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/imports/linear'),
    name: 'Linear Import',
    path: 'imports/linear',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/general'),
    name: 'General',
    path: 'general',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/members'),
    name: 'Members',
    path: 'members',
    skeleton: 'list',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/notification'),
    name: 'Notification',
    path: 'notification',
    skeleton: 'form',
  },
  // Channel detail level of the two-level notification settings — the page
  // reads the channel id from the `sub` route param.
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/notification'),
    name: 'Notification > Channel',
    path: 'notification/:sub',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/statistics'),
    name: 'Statistics',
    path: 'statistics',
    skeleton: 'grid',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/plans'),
    name: 'Plans',
    path: 'plans',
    skeleton: 'detail',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/billing'),
    name: 'Billing',
    path: 'billing',
    skeleton: 'detail',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/budget'),
    name: 'Budget',
    path: 'budget',
    skeleton: 'detail',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/credits'),
    name: 'Credits',
    path: 'credits',
    skeleton: 'detail',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/usage'),
    name: 'Usage',
    path: 'usage',
    skeleton: 'grid',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/service-model'),
    name: 'Service Model',
    path: 'service-model',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/credential'),
    name: 'Credential',
    path: 'credential',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/apikey'),
    name: 'API Key',
    path: 'apikey',
    skeleton: 'list',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/labels'),
    name: 'Labels',
    path: 'labels',
    skeleton: 'list',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/devices'),
    name: 'Devices',
    path: 'devices',
    skeleton: 'list',
  },
  // Account-level tabs mirrored inside the workspace — the pages are the
  // personal settings pages; only the chrome is workspace-owned.
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/profile'),
    name: 'Profile',
    path: 'profile',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/appearance'),
    name: 'Appearance',
    path: 'appearance',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/hotkey'),
    name: 'Hotkey',
    path: 'hotkey',
    skeleton: 'form',
  },
  // Developer tools mirrored inside the workspace (user preferences).
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/advanced'),
    name: 'Advanced',
    path: 'advanced',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/labs'),
    name: 'Labs',
    path: 'labs',
    skeleton: 'form',
  },
  {
    load: () => import('@/routes/(main)/[workspaceSlug]/settings/about'),
    name: 'About',
    path: 'about',
    skeleton: 'form',
  },
];

/**
 * Legacy `/<slug>/settings/<alias>` deep links, from the shared alias registry.
 * They are relative and resolve against the current URL, so they sit together
 * regardless of which group their live destination lives in.
 */
export const sharedWorkspaceSettingsAliasRoutes: RouteObject[] = WORKSPACE_SETTINGS_ALIASES.flatMap(
  ({ alias, subPaths, target }): RouteObject[] => {
    const element = redirectElement(target === 'root' ? '..' : `../${target}`);
    return [{ element, path: alias }, ...(subPaths ? [{ element, path: `${alias}/:sub` }] : [])];
  },
);

/** Legacy `/<slug>/settings/linear` deep links land on the Linear import tab. */
export const sharedWorkspaceSettingsRedirects: RouteObject[] = [
  { element: redirectElement('../imports/linear'), path: 'linear' },
  // Path-shaped provider deep-links (`/:slug/settings/provider/:id`)
  // redirect to the query form the workspace provider page uses, so
  // they don't fall through to the catch-all and leave the workspace.
  // Static element: the redirect is tiny and lazy-loading it would
  // flash the generic brand loader before redirecting.
  { element: <WorkspaceProviderRedirect />, path: 'provider/:providerId' },
];
