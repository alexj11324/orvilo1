import { describe, expect, it } from 'vitest';

import { HotkeyEnum, HotkeyGroupEnum, HOTKEYS_REGISTRATION, HotkeyScopeEnum } from './hotkeys';
import { DEFAULT_HOTKEY_CONFIG } from './settings/hotkey';

describe('HOTKEYS_REGISTRATION', () => {
  it('has unique ids', () => {
    const ids = HOTKEYS_REGISTRATION.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no chord conflicts between default bindings', () => {
    const keys = HOTKEYS_REGISTRATION.map((item) => item.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('provides a default binding for every registered id', () => {
    for (const item of HOTKEYS_REGISTRATION) {
      expect(DEFAULT_HOTKEY_CONFIG[item.id]).toBe(item.keys);
    }
  });
});

describe('Linear parity mappings', () => {
  const byId = (id: string) => HOTKEYS_REGISTRATION.find((item) => item.id === id);

  it('does not advertise a main-sidebar collapse shortcut', () => {
    expect(byId(HotkeyEnum.ToggleLeftPanel)).toBeUndefined();
    expect(HOTKEYS_REGISTRATION.some((item) => item.keys === 'mod+bracketleft')).toBe(false);
  });

  it('maps C to create task', () => {
    expect(byId(HotkeyEnum.CreateTask)).toMatchObject({
      group: HotkeyGroupEnum.Essential,
      keys: 'c',
      scopes: [HotkeyScopeEnum.Global],
    });
  });

  it.each([
    [HotkeyEnum.GoToInbox, 'g>i'],
    [HotkeyEnum.GoToMyIssues, 'g>m'],
    [HotkeyEnum.GoToReviews, 'g>r'],
    [HotkeyEnum.GoToDrafts, 'g>d'],
    [HotkeyEnum.GoToProjects, 'g>p'],
    [HotkeyEnum.GoToViews, 'g>v'],
  ])('registers %s as a non-editable g-sequence (%s)', (id, keys) => {
    // Sequences cannot be recorded by HotkeyInput, so they stay nonEditable.
    expect(byId(id)).toMatchObject({
      group: HotkeyGroupEnum.Essential,
      keys,
      nonEditable: true,
      scopes: [HotkeyScopeEnum.Global],
    });
  });

  it('maps ? (shift+slash) to the shortcuts help modal', () => {
    expect(byId(HotkeyEnum.OpenHotkeyHelper)).toMatchObject({
      group: HotkeyGroupEnum.Essential,
      keys: 'shift+slash',
      scopes: [HotkeyScopeEnum.Global],
    });
  });

  it('keeps mod+k for the command palette', () => {
    expect(byId(HotkeyEnum.CommandPalette)).toMatchObject({
      keys: 'mod+k',
      scopes: [HotkeyScopeEnum.Global],
    });
  });
});
