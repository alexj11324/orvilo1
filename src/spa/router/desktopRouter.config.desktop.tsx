'use client';

import type { RouteObject } from 'react-router';

import { dynamicElement, ErrorBoundary } from '@/utils/router';

import {
  createMainAreaRouteFactory,
  createSharedDesktopRoutes,
  type MainAreaRouteOptions,
} from './desktopRouter.shared';
import WebHomeRedirect from './WebHomeRedirect';

export { sharedMainAreaChildren } from './desktopRouter.shared';

const mainAreaRouteOptions: MainAreaRouteOptions = {
  // The first screen every tab paints — eager so it never suspends behind a chunk fetch.
  // Same landing element as Web: an empty tab's index redirects to `/tasks`,
  // which is where the real kanban lives inside each tab's own memory router.
  // Explicit tab urls are unaffected — only the `/` and `/:workspaceSlug`
  // index slots carry it.
  createHomeElement: () => <WebHomeRedirect />,
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

export const desktopRoutes: RouteObject[] = createSharedDesktopRoutes({
  // Page content is mounted by per-tab memory routers. The root owns only the
  // persistent TabHost shell and must not render a second copy of the pages.
  mainAreaChildren: [
    { element: null, index: true },
    { element: null, path: '*' },
  ],
  // The unified `/onboarding` flow is shared with Web; a `DesktopAuthGate`
  // inside it supplies the system-browser sign-in step when no remote server
  // is configured yet.
  onboardingRoute: {
    element: dynamicElement(() => import('@/routes/onboarding'), 'Desktop > Onboarding'),
    errorElement: <ErrorBoundary />,
    path: '/onboarding',
  },
  // `/desktop-onboarding` is the retired pre-unification flow: the path stays
  // registered for legacy links but only ever forwards to `/onboarding` (or
  // `/settings/devices` for the moved OS-permission screen).
  platformRoutes: [
    {
      element: dynamicElement(
        () => import('@/routes/(desktop)/desktop-onboarding'),
        'Desktop > Desktop Onboarding Redirect',
      ),
      errorElement: <ErrorBoundary />,
      path: '/desktop-onboarding',
    },
  ],
});
