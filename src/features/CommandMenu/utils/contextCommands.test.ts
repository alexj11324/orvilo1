import { describe, expect, it } from 'vitest';

import { type SettingsCapabilityContext } from '@/config/routes/settings';

import { getContextCommands } from './contextCommands';

const capabilityContext = (
  overrides: Partial<SettingsCapabilityContext> = {},
): SettingsCapabilityContext => ({
  enableBusinessFeatures: true,
  hideDocs: false,
  isDesktop: true,
  isDevMode: false,
  mobile: false,
  showApiKeyManage: true,
  ...overrides,
});

describe('getContextCommands', () => {
  it('does not offer settings commands for retired surfaces', () => {
    const commands = getContextCommands('settings', undefined, {
      capabilityContext: capabilityContext(),
    });

    // /settings/image retired with the image workbench settings; only routes
    // that still exist may be offered.
    const paths = commands.map((command) => command.path);
    expect(paths).not.toContain('/settings/image');
    expect(paths.every((path) => !path.startsWith('/image') && !path.startsWith('/video'))).toBe(
      true,
    );
  });

  it('filters the current sub-path out of the settings command list', () => {
    const commands = getContextCommands('settings', 'profile', {
      capabilityContext: capabilityContext({ enableBusinessFeatures: false }),
    });

    expect(commands.some((command) => command.subPath === 'profile')).toBe(false);
  });

  it('follows the settings capability gate: host surfaces are absent off-desktop', () => {
    const commands = getContextCommands('settings', undefined, {
      capabilityContext: capabilityContext({ isDesktop: false }),
    });

    const paths = commands.map((command) => command.path);
    expect(paths).not.toContain('/settings/proxy');
    expect(paths).toContain('/settings/about');
  });

  it('follows the settings capability gate: business surfaces track the deployment flag', () => {
    const commands = getContextCommands('settings', undefined, {
      capabilityContext: capabilityContext({ enableBusinessFeatures: false }),
    });

    const paths = commands.map((command) => command.path);
    for (const gated of [
      '/settings/plans',
      '/settings/credits',
      '/settings/usage',
      '/settings/billing',
    ]) {
      expect(paths).not.toContain(gated);
    }
  });
});
