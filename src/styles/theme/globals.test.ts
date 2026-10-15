import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateTheme, type ThemeMode } from './generate';

const globals = readFileSync(path.resolve(import.meta.dirname, '../../app/globals.css'), 'utf8');

/** Declarations of the first block that opens with `selector {`. */
const block = (selector: string) => {
  const start = globals.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`globals.css has no ${selector} block`);
  const body = globals.slice(start, globals.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/^\s*--([\w-]+):\s*([^\s;][^;]*);/gm)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
};

const BLOCKS: Record<ThemeMode, string> = {
  dark: ".dark,\n[data-theme='dark']",
  light: ':root',
};

describe('globals.css default theme', () => {
  it.each(['light', 'dark'] as const)(
    'bootstraps exactly the generator’s default %s roles',
    (mode) => {
      const declared = block(BLOCKS[mode]);
      const { roles } = generateTheme({ mode });
      const expected = Object.fromEntries(Object.keys(roles).map((name) => [name, declared[name]]));
      expect(expected).toEqual(roles);
    },
  );

  it('no longer reads colours from the antd engine', () => {
    expect(globals).not.toMatch(new RegExp(`--${'ant'}-[a-z]`));
  });
});
