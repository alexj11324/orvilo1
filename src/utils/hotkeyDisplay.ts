/** Display normalized shortcut tokens with the local keyboard-chip primitives. */
export const hotkeyDisplayKeys = (shortcut: string, macOS: boolean): string[] =>
  shortcut.split('+').map((key) => {
    if (key === 'mod') return macOS ? '⌘' : 'Ctrl';
    if (key === 'comma') return ',';
    return key;
  });
