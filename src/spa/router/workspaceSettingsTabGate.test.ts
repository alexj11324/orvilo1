import type { ReactElement } from 'react';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import WorkspaceSettingsTabGate from '@/features/WorkspaceSetting/TabGate';

import { createMainAreaChildren as createWebMainAreaChildren } from './desktopRouter.config';
import { createMainAreaChildren as createElectronMainAreaChildren } from './desktopRouter.config.desktop';
import { mobileRoutes } from './mobileRouter.config';

type Routes = Parameters<typeof matchRoutes>[0];

const surfaces: Array<[string, Routes]> = [
  ['Web', [{ children: createWebMainAreaChildren(), path: '/' }]],
  ['Electron', [{ children: createElectronMainAreaChildren(), path: '/' }]],
  ['Mobile', mobileRoutes],
];

const elementOf = (routes: Routes, pathname: string) =>
  matchRoutes(routes, pathname)?.at(-1)?.route.element as ReactElement | undefined;

describe('business-only workspace settings routes', () => {
  it.each(surfaces)('%s gates every business tab behind the deployment flag', (_, routes) => {
    for (const tab of ['plans', 'usage', 'credits', 'budget', 'billing', 'notification']) {
      const element = elementOf(routes, `/acme/settings/${tab}`);

      expect(element?.type, `${tab} is not gated`).toBe(WorkspaceSettingsTabGate);
      expect((element?.props as { tab: string }).tab).toBe(tab);
    }
  });

  it.each(surfaces)('%s gates the notification channel detail route too', (_, routes) => {
    expect(elementOf(routes, '/acme/settings/notification/email')?.type).toBe(
      WorkspaceSettingsTabGate,
    );
  });

  it.each(surfaces)('%s leaves ordinary tabs ungated', (_, routes) => {
    for (const tab of ['general', 'members', 'imports', 'statistics']) {
      expect(elementOf(routes, `/acme/settings/${tab}`)?.type).not.toBe(WorkspaceSettingsTabGate);
    }
  });
});
