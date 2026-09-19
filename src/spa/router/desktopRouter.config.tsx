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

// Task-first: Web's index slot points at the task list. It has to be an element
// rather than a redirect in the shared tree because Electron fills the same
// slot with its own per-tab Home.
const mainAreaRouteOptions: MainAreaRouteOptions = {
  createHomeElement: () => <WebHomeRedirect />,
};

export const createMainAreaChildren = createMainAreaRouteFactory(mainAreaRouteOptions);

// Electron consumers resolve tab metadata against the same complete content
// tree. The Web root also renders this tree directly.
export const mainAreaMetaRoutes: RouteObject[] = [
  { children: createMainAreaChildren(), path: '/' },
];

// `/share/*` is served by the standalone Share app (apps/share), not this router.
const webOnlyRoutes: RouteObject[] = [
  {
    element: dynamicElement(() => import('@/routes/verify-im'), 'Desktop > VerifyIm'),
    errorElement: <ErrorBoundary />,
    path: '/verify-im',
  },
];

export const desktopRoutes: RouteObject[] = createSharedDesktopRoutes({
  mainAreaChildren: createMainAreaChildren(),
  onboardingRoute: {
    element: dynamicElement(() => import('@/routes/onboarding'), 'Desktop > Onboarding'),
    errorElement: <ErrorBoundary />,
    path: '/onboarding',
  },
  platformRoutes: webOnlyRoutes,
});
