import { describe, expect, it } from 'vitest';

import { hotkeyDisplayKeys } from './hotkeyDisplay';

describe('hotkeyDisplayKeys', () => {
  it('shows the settings shortcut with Command and comma on macOS', () => {
    expect(hotkeyDisplayKeys('mod+comma', true)).toEqual(['⌘', ',']);
  });

  it('shows the settings shortcut with Control and comma on Windows and Linux', () => {
    expect(hotkeyDisplayKeys('mod+comma', false)).toEqual(['Ctrl', ',']);
  });

  it('preserves other shortcut tokens and their order', () => {
    expect(hotkeyDisplayKeys('shift+alt+k', true)).toEqual(['shift', 'alt', 'k']);
    expect(hotkeyDisplayKeys('mod+k', false)).toEqual(['Ctrl', 'k']);
  });
});
