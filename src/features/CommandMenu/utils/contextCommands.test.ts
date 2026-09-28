import { describe, expect, it } from 'vitest';

import { getContextCommands } from './contextCommands';

describe('getContextCommands', () => {
  it('does not offer settings commands for retired surfaces', () => {
    const commands = getContextCommands('settings', undefined, {
      enableBusinessFeatures: true,
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
      enableBusinessFeatures: false,
    });

    expect(commands.some((command) => command.subPath === 'profile')).toBe(false);
  });
});
