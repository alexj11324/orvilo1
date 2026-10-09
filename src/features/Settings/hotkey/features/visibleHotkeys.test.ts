import { HOTKEYS_REGISTRATION } from '@orvilo/const/hotkeys';
import { describe, expect, it } from 'vitest';

import { DESKTOP_ONLY_HOTKEY_IDS, getHotkeyConflicts, getVisibleHotkeys } from './visibleHotkeys';

const ids = (desktop: boolean, group: 'conversation' | 'essential') =>
  getVisibleHotkeys(HOTKEYS_REGISTRATION, group, desktop).map((item) => item.id);

describe('getVisibleHotkeys', () => {
  it('hides the desktop-only shortcuts on the web', () => {
    const web = [...ids(false, 'essential'), ...ids(false, 'conversation')];
    for (const id of DESKTOP_ONLY_HOTKEY_IDS) expect(web).not.toContain(id);
  });

  it('shows every registered shortcut in the desktop app', () => {
    const desktop = [...ids(true, 'essential'), ...ids(true, 'conversation')];
    expect(desktop).toHaveLength(HOTKEYS_REGISTRATION.length);
  });

  it('only lists shortcuts that are still registered', () => {
    const registered = new Set(HOTKEYS_REGISTRATION.map((item) => item.id));
    for (const id of DESKTOP_ONLY_HOTKEY_IDS) expect(registered.has(id)).toBe(true);
  });

  it('no longer registers shortcuts that have no handler', () => {
    const registered = HOTKEYS_REGISTRATION.map((item) => item.id as string);
    for (const id of [
      'regenerateMessage',
      'deleteLastMessage',
      'deleteAndRegenerateMessage',
      'switchAgent',
    ])
      expect(registered).not.toContain(id);
  });
});

describe('getHotkeyConflicts', () => {
  it('lists the other registered bindings but not the shortcut itself', () => {
    const conflicts = getHotkeyConflicts(
      { commandPalette: 'mod+k', search: 'mod+j' },
      'search',
      HOTKEYS_REGISTRATION,
    );

    expect(conflicts).toEqual(['mod+k']);
  });

  it('ignores stored bindings of shortcuts that were retired from the registry', () => {
    const conflicts = getHotkeyConflicts(
      { regenerateMessage: 'alt+r', search: 'mod+j' },
      'commandPalette',
      HOTKEYS_REGISTRATION,
    );

    expect(conflicts).toEqual(['mod+j']);
  });

  it('skips cleared bindings', () => {
    expect(getHotkeyConflicts({ search: '' }, 'commandPalette', HOTKEYS_REGISTRATION)).toEqual([]);
  });
});
