/** Convert Electron accelerator names to the vocabulary accepted by HotkeyInput. */
export const desktopHotkeyDisplay = (accelerator: string): string =>
  accelerator
    .replace(/\+\+$/, '+Plus')
    .split('+')
    .map((key) => {
      const normalized = key.trim().toLowerCase();
      const aliases: Record<string, string> = {
        'commandorcontrol': 'mod',
        'cmdorctrl': 'mod',
        'command': 'meta',
        'cmd': 'meta',
        'control': 'ctrl',
        'option': 'alt',
        ',': 'comma',
      };
      return aliases[normalized] ?? normalized;
    })
    .join('+');
