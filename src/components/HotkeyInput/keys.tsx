import {
  ArrowBigUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  ChevronUpIcon,
  Command,
  CornerDownLeftIcon,
  Delete,
  Grid2X2Icon,
  Option,
  SpaceIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

/** Modifiers in display order; anything else sorts after them. */
const MODIFIERS = ['ctrl', 'control', 'commandorcontrol', 'meta', 'mod', 'alt', 'shift'];

/** Splits a stored `mod+shift+k` string into keys, modifiers first. `++` is the plus key. */
export const splitHotkey = (keys: string): string[] =>
  keys
    .replaceAll('++', '+equal')
    .split('+')
    .filter(Boolean)
    .sort((a, b) => {
      const rank = (key: string) => {
        const index = MODIFIERS.indexOf(key.toLowerCase());
        return index === -1 ? MODIFIERS.length : index;
      };
      return rank(a) - rank(b);
    });

/** Whether two hotkey strings name the same combination regardless of order. */
export const isSameHotkey = (a: string, b: string): boolean => {
  const left = splitHotkey(a);
  const right = splitHotkey(b);
  return left.length === right.length && left.every((key, index) => key === right[index]);
};

export const isAppleDevice = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipod|ipad|ios/i.test(navigator.userAgent);

/**
 * Normalizes recorded keys into a stored hotkey string: one `mod` for the
 * platform command key, then the other modifiers, then the last regular key.
 * A combination without a modifier or regular key is invalid.
 */
export const normalizeRecordedKeys = (
  recorded: Iterable<string>,
  apple: boolean,
): { isValid: boolean; keys: string[] } => {
  const modifiers: string[] = [];
  const regular: string[] = [];

  for (const key of recorded) {
    const lower = key.toLowerCase();
    if (!MODIFIERS.includes(lower)) {
      regular.push(key);
      continue;
    }
    const isCommand = apple ? lower === 'meta' : lower === 'ctrl';
    const name = isCommand ? 'mod' : lower;
    if (!modifiers.includes(name)) modifiers.push(name);
  }

  if (modifiers.length === 0 || regular.length === 0) return { isValid: false, keys: [] };

  return { isValid: true, keys: [...modifiers, regular.at(-1)!] };
};

const startCase = (key: string) =>
  key
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

const icon = (Glyph: typeof Command) => <Glyph className="size-[0.95em]" />;

const keyLabel = (key: string, apple: boolean): ReactNode => {
  switch (key.toLowerCase()) {
    case 'alt': {
      return apple ? icon(Option) : 'Alt';
    }
    case 'backspace': {
      return apple ? icon(Delete) : 'Backspace';
    }
    case 'mod':
    case 'commandorcontrol': {
      return apple ? icon(Command) : 'Ctrl';
    }
    case 'ctrl':
    case 'control': {
      return apple ? icon(ChevronUpIcon) : 'Ctrl';
    }
    case 'meta': {
      return apple ? icon(Command) : icon(Grid2X2Icon);
    }
    case 'shift': {
      return apple ? icon(ArrowBigUpIcon) : 'Shift';
    }
    case 'enter': {
      return apple ? icon(CornerDownLeftIcon) : 'Enter';
    }
    case 'tab': {
      return apple ? icon(ArrowRightToLineIcon) : 'Tab';
    }
    case 'space': {
      return icon(SpaceIcon);
    }
    case 'up': {
      return icon(ArrowUpIcon);
    }
    case 'down': {
      return icon(ArrowDownIcon);
    }
    case 'left': {
      return icon(ArrowLeftIcon);
    }
    case 'right': {
      return icon(ArrowRightIcon);
    }
    case 'comma': {
      return ',';
    }
    case 'period': {
      return '.';
    }
    case 'slash': {
      return '?';
    }
    case 'semicolon': {
      return ';';
    }
    case 'quote': {
      return "'";
    }
    case 'backquote': {
      return '`';
    }
    case 'backslash': {
      return '\\';
    }
    case 'bracketleft': {
      return '[';
    }
    case 'bracketright': {
      return ']';
    }
    case 'minus': {
      return '-';
    }
    case 'equal': {
      return '+';
    }
    default: {
      return startCase(key);
    }
  }
};

export const hotkeyLabels = (keys: string, apple: boolean): ReactNode[] =>
  splitHotkey(keys).map((key) => keyLabel(key, apple));
