import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const target = path.join(dir, entry);

    if (statSync(target).isDirectory()) return walk(target);

    return target.endsWith('route.ts') ? [target] : [];
  });

const devShells = walk(path.resolve(root, 'src/app'))
  .flatMap((file) => {
    const source = readFileSync(file, 'utf8');

    return [...source.matchAll(/fetchViteDevTemplate\('(\/[^']+\.html)'\)/g)].map((match) => ({
      file: path.relative(root, file),
      template: match[1]!,
    }));
  })
  .sort((a, b) => a.template.localeCompare(b.template));

describe('dev SPA shells', () => {
  it('finds every route handler that fetches a named dev template', () => {
    expect(devShells.map((shell) => shell.template)).toEqual(['/index.auth.html']);
  });

  // A typo or a forgotten file makes Vite 404 the shell in dev only, so pin the
  // file each route handler names to one that actually exists at the repo root.
  it.each(devShells)('$template exists at the repo root for $file', ({ template }) => {
    expect(existsSync(path.resolve(root, `.${template}`))).toBe(true);
  });
});
