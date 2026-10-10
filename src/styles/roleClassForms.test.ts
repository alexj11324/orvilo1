// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cn } from 'cn';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('role class forms', () => {
  // The lookup in .agents/skills/react/SKILL.md tells agents to write these
  // forms instead of pixel literals. They only work if `cn` resolves them
  // against the built-in utilities of the same property.
  it('merges the variable forms as font size and radius', () => {
    expect(cn('text-sm', 'text-(length:--text-dense)')).toBe('text-(length:--text-dense)');
    expect(cn('text-(length:--text-dense)', 'text-xs')).toBe('text-xs');
    expect(cn('text-foreground', 'text-(length:--text-dense)')).toBe(
      'text-foreground text-(length:--text-dense)',
    );
    expect(cn('rounded-lg', 'rounded-(--radius-card)')).toBe('rounded-(--radius-card)');
    expect(cn('rounded-(--radius-card)', 'rounded-full')).toBe('rounded-full');
  });

  // Why the roles are not registered as `text-dense` / `rounded-card` in
  // @theme. If `cn` learns custom names, the lookup can use the short form.
  it('cannot classify an invented role utility', () => {
    expect(cn('text-foreground', 'text-dense')).toBe('text-dense');
    expect(cn('rounded-md', 'rounded-card')).toBe('rounded-md rounded-card');
  });

  it('declares every role variable the lookup names', () => {
    const lookup = read('.agents/skills/react/SKILL.md').split('### Role lookup')[1];
    const css = read('src/app/globals.css');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('.dark,'));
    const names = [
      ...new Set([...lookup.matchAll(/\((?:length:)?(--[\da-z-]+)\)/g)].map((m) => m[1])),
    ];

    expect(names).toEqual(
      expect.arrayContaining(['--text-dense', '--radius-card', '--radius-overlay']),
    );
    for (const name of names) expect(root).toMatch(new RegExp(`${name}:\\s*\\d+px;`));
  });
});
