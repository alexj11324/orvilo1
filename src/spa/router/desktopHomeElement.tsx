'use client';

import type { ReactElement } from 'react';

import { dynamicElement } from '@/utils/router';

/**
 * Home element for the desktop main area, behind a platform boundary.
 *
 * `DesktopHomeRoute` statically pulls in the whole Home page graph — ~770 src
 * modules. `desktopRouter.config.tsx` is imported by ~29 modules under `src/`,
 * and neither tsgo nor vitest applies the `platformResolve` Vite plugin, so a
 * static import here is paid by every test file that touches the router: it
 * took the app suite from ~13min to over 85min in CI.
 *
 * So the base module keeps Home lazy, and `desktopHomeElement.desktop.tsx`
 * carries the eager version that the Electron renderer build resolves.
 */
export const createDesktopHomeElement = (): ReactElement =>
  dynamicElement(() => import('./DesktopHomeRoute'), 'Desktop > Home');
