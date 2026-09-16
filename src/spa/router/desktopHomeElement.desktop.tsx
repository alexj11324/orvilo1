'use client';

import type { ReactElement } from 'react';

import DesktopHomeRoute from './DesktopHomeRoute';

/**
 * Electron variant: Home is the first screen every tab paints, so it is eager
 * and never suspends behind a chunk fetch. Only the renderer build resolves
 * this file (`platformResolve('desktop')`), which keeps the Home page graph out
 * of the module graph that tsgo and vitest evaluate — see the base module.
 */
export const createDesktopHomeElement = (): ReactElement => <DesktopHomeRoute />;
