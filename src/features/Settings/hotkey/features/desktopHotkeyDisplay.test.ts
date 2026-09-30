import { describe, expect, it } from 'vitest';

import { desktopHotkeyDisplay } from './desktopHotkeyDisplay';

describe('desktopHotkeyDisplay', () => {
  it('renders platform-aware settings shortcut instead of Electron internal names', () => {
    expect(desktopHotkeyDisplay('CommandOrControl+,')).toBe('mod+comma');
    expect(desktopHotkeyDisplay('CmdOrCtrl+,')).toBe('mod+comma');
  });
  it('preserves custom modifiers, unbound shortcuts and already normalized values', () => {
    expect(desktopHotkeyDisplay('Command+Option+Shift+Space')).toBe('meta+alt+shift+space');
    expect(desktopHotkeyDisplay('Control+Shift+K')).toBe('ctrl+shift+k');
    expect(desktopHotkeyDisplay('Alt+Plus')).toBe('alt+plus');
    expect(desktopHotkeyDisplay('Control++')).toBe('ctrl+plus');
    expect(desktopHotkeyDisplay('mod+comma')).toBe('mod+comma');
    expect(desktopHotkeyDisplay('')).toBe('');
  });
});
