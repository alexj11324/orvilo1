'use client';

import type { RouteObject } from 'react-router';

import { acceptanceRouteMeta } from '@/features/Acceptance/routeMeta';
import { dynamicElement, ErrorBoundary } from '@/utils/router';

import DesktopHomeRoute from './DesktopHomeRoute';
import {
  createMainAreaRouteFactory,
  createSharedDesktopRoutes,
  type MainAreaRouteOptions,
} from './desktopRouter.shared';

export { sharedMainAreaChildren } from './desktopRouter.shared';

const mainAreaRouteOptions: MainAreaRouteOptions = {
  // The first screen every tab paints — eager so it never suspends behind a chunk fetch.
  createHomeElement: () => <DesktopHomeRoute />,
  createWorkspaceSettingsIndexElement: () =>
    dynamicElement(
      () => import('@/routes/(main)/[workspaceSlug]/settings'),
      'Desktop > Workspace > Settings > Index',
    ),
};

export const createMainAreaChildren = createMainAreaRouteFactory(mainAreaRouteOptions);

// The Electron root router contains only TabHost stubs, so tab titles and
// recently-viewed entries resolve metadata against this complete content tree.
export const mainAreaMetaRoutes: RouteObject[] = [
  { children: createMainAreaChildren(), path: '/' },
];

// Standalone surfaces that live beside the main layout rather than inside a tab.
// Both are also registered by `mobileRouter.config.tsx`; they used to be
// desktop-only here because the browser SPA owned them.
const standaloneRoutes: RouteObject[] = [
  {
    element: dynamicElement(() => import('@/routes/verify-im'), 'Desktop > VerifyIm'),
    errorElement: <ErrorBoundary />,
    path: '/verify-im',
  },

  {
    children: [
      {
        element: dynamicElement(
          () => import('@/routes/(main)/acceptance/empty'),
          'Desktop > Acceptance Empty',
        ),
        index: true,
      },
      {
        element: dynamicElement(
          () => import('@/routes/acceptance/[acceptanceId]'),
          'Desktop > AcceptanceReport',
        ),
        handle: { meta: acceptanceRouteMeta },
        path: ':acceptanceId',
      },
      {
        element: dynamicElement(
          () => import('@/routes/acceptance/[acceptanceId]'),
          'Desktop > AcceptanceCheck',
        ),
        handle: { meta: acceptanceRouteMeta },
        path: ':acceptanceId/check/:checkId',
      },
    ],
    element: dynamicElement(() => import('@/routes/(main)/acceptance'), 'Desktop > Acceptance'),
    errorElement: <ErrorBoundary />,
    handle: { meta: acceptanceRouteMeta },
    path: '/acceptance',
  },
];

export const desktopRoutes: RouteObject[] = createSharedDesktopRoutes({
  // Page content is mounted by per-tab memory routers. The root owns only the
  // persistent TabHost shell and must not render a second copy of the pages.
  mainAreaChildren: [
    { element: null, index: true },
    { element: null, path: '*' },
  ],
  onboardingRoute: {
    element: dynamicElement(
      () => import('@/routes/(desktop)/desktop-onboarding'),
      'Desktop > Desktop Onboarding',
    ),
    errorElement: <ErrorBoundary />,
    path: '/desktop-onboarding',
  },
  platformRoutes: standaloneRoutes,
});
