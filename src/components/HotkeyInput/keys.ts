export interface KeyEventSnapshot {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}
const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph']);
export const isModifier = (key: string) => MODIFIERS.has(key);
const CODE_KEYS: Record<string, string> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  Backquote: 'backquote',
  Backslash: 'backslash',
  BracketLeft: 'bracketleft',
  BracketRight: 'bracketright',
  Comma: 'comma',
  Equal: 'equal',
  Minus: 'minus',
  NumpadAdd: 'equal',
  NumpadDecimal: 'period',
  NumpadDivide: 'slash',
  NumpadSubtract: 'minus',
  Escape: 'esc',
  Period: 'period',
  Quote: 'quote',
  Semicolon: 'semicolon',
  Slash: 'slash',
  Space: 'space',
};
export function shortcutFromEvent(event: KeyEventSnapshot, apple: boolean): string | undefined {
  if (
    isModifier(event.key) ||
    event.key === 'Unidentified' ||
    event.key === 'Dead' ||
    event.key === 'Process'
  )
    return;
  const keys: string[] = [];
  if (event.ctrlKey) keys.push(apple ? 'ctrl' : 'mod');
  if (event.metaKey) keys.push(apple ? 'mod' : 'meta');
  if (event.altKey) keys.push('alt');
  if (event.shiftKey) keys.push('shift');
  if (!keys.length) return;
  const key =
    CODE_KEYS[event.code] ??
    (/^(?:Key|Digit)[A-Z0-9]$/.test(event.code)
      ? event.code.replace(/^(?:Key|Digit)/, '').toLowerCase()
      : event.key.toLowerCase());
  return [...keys, key].join('+');
}
export function canonicalShortcut(value: string, apple: boolean): string {
  const aliases: Record<string, string> = {
    'command': 'meta',
    'cmd': 'meta',
    'control': 'ctrl',
    'option': 'alt',
    'commandorcontrol': 'mod',
    'cmdorctrl': 'mod',
    'plus': 'equal',
    '=': 'equal',
    ',': 'comma',
    'escape': 'esc',
    'arrowleft': 'left',
    'arrowright': 'right',
    'arrowup': 'up',
    'arrowdown': 'down',
  };
  const tokens = value
    .replace(/\+\+$/, '+equal')
    .split('+')
    .map((item) => {
      const key = item.trim().toLowerCase();
      const alias = aliases[key] ?? key;
      return (alias === 'meta' && apple) || (alias === 'ctrl' && !apple) ? 'mod' : alias;
    })
    .filter(Boolean);
  const order = ['mod', 'ctrl', 'meta', 'alt', 'shift'];
  return [...new Set(tokens)]
    .sort((a, b) => {
      const x = order.indexOf(a),
        y = order.indexOf(b);
      return (x < 0 ? 100 : x) - (y < 0 ? 100 : y) || a.localeCompare(b);
    })
    .join('+');
}
export function shortcutLabel(value: string, apple: boolean): string {
  const labels: Record<string, string> = {
    mod: apple ? '⌘' : 'Ctrl',
    meta: '⌘',
    ctrl: 'Ctrl',
    alt: apple ? '⌥' : 'Alt',
    shift: apple ? '⇧' : 'Shift',
    equal: '=',
    comma: ',',
    space: 'Space',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
  };
  return value
    .split('+')
    .map((key) => labels[key] ?? (key.length === 1 ? key.toUpperCase() : key))
    .join(apple ? ' ' : ' + ');
}
