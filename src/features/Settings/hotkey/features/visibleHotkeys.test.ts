import { HOTKEYS_REGISTRATION } from '@orvilo/const/hotkeys';
import { describe, expect, it } from 'vitest';

import {
  DESKTOP_ONLY_HOTKEY_IDS,
  getDesktopHotkeyConflicts,
  getHotkeyChangeConflict,
  getHotkeyConflicts,
  getVisibleHotkeys,
} from './visibleHotkeys';

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

describe('getHotkeyChangeConflict', () => {
  it.each([
    { id: 'commandPalette', keys: 'mod+k' },
    { id: 'saveTopic', keys: 'alt+n' },
  ])('rejects resetting $id to a desktop binding', ({ id, keys }) => {
    expect(
      getHotkeyChangeConflict({ [id]: keys }, { [id]: 'mod+shift+x' }, HOTKEYS_REGISTRATION, [
        keys,
      ]),
    ).toBe(id);
  });

  it('accepts resetting to an unassigned default', () => {
    expect(
      getHotkeyChangeConflict(
        { commandPalette: 'mod+k' },
        { commandPalette: 'mod+shift+x' },
        HOTKEYS_REGISTRATION,
        ['mod+j'],
      ),
    ).toBeUndefined();
  });

  it('allows clearing a conflicting binding', () => {
    expect(
      getHotkeyChangeConflict(
        { commandPalette: '' },
        { commandPalette: 'mod+k' },
        HOTKEYS_REGISTRATION,
        ['mod+k'],
      ),
    ).toBeUndefined();
  });

  it('checks a multi-field change against the resulting settings', () => {
    expect(
      getHotkeyChangeConflict(
        { commandPalette: 'mod+s', saveTopic: 'mod+s' },
        { commandPalette: 'mod+k', saveTopic: '' },
        HOTKEYS_REGISTRATION,
      ),
    ).toBe('commandPalette');
  });
});

describe('getHotkeyConflicts', () => {
  it('lists other bindings of the same group but not the shortcut itself', () => {
    const conflicts = getHotkeyConflicts(
      { commandPalette: 'mod+k', search: 'mod+j' },
      'search',
      HOTKEYS_REGISTRATION,
    );

    expect(conflicts).toEqual(['mod+k']);
  });

  it('counts bindings from another group', () => {
    const group = (id: string) => HOTKEYS_REGISTRATION.find((item) => item.id === id)?.group;
    expect(group('commandPalette')).toBe('essential');
    expect(group('saveTopic')).toBe('conversation');

    expect(
      getHotkeyConflicts(
        { commandPalette: 'mod+k', saveTopic: 'mod+s' },
        'commandPalette',
        HOTKEYS_REGISTRATION,
      ),
    ).toEqual(['mod+s']);
  });

  it('counts desktop global shortcuts passed as external bindings, even with a colliding id', () => {
    // `showApp` exists both as an in-app and as an Electron global shortcut.
    const conflicts = getHotkeyConflicts(
      { showApp: 'mod+shift+a' },
      'showApp',
      HOTKEYS_REGISTRATION,
      ['alt+shift+space', '', undefined],
    );

    expect(conflicts).toEqual(['alt+shift+space']);
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

describe('getDesktopHotkeyConflicts', () => {
  const desktopBindings = {
    openSettings: 'CommandOrControl+,',
    quickChat: '',
    quickComposer: 'Alt+Shift+Space',
    showApp: '',
  };

  it('rejects an in-app binding for an empty desktop row (Quick Chat vs Command Palette)', () => {
    const conflicts = getDesktopHotkeyConflicts(
      desktopBindings,
      'quickChat',
      { commandPalette: 'mod+k' },
      HOTKEYS_REGISTRATION,
    );

    expect(conflicts).toContain('mod+k');
  });

  it('includes the other desktop shortcuts in HotkeyInput format but not itself', () => {
    const conflicts = getDesktopHotkeyConflicts(
      desktopBindings,
      'quickComposer',
      {},
      HOTKEYS_REGISTRATION,
    );

    expect(conflicts).toEqual(['mod+comma']);
  });

  it('does not let a retired in-app id block a combination', () => {
    expect(
      getDesktopHotkeyConflicts(
        desktopBindings,
        'quickChat',
        { regenerateMessage: 'mod+k' },
        HOTKEYS_REGISTRATION,
      ),
    ).not.toContain('mod+k');
  });
});
