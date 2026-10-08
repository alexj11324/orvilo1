// Compiles the design CSS for design-system sync: Orvilo's Tailwind v4 tokens
// from src/app/globals.css (minus the antd reset) plus the utilities used by
// src/components/{ui,reui}. Output: dist/styles.css.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgDir, '../..');
const buildDir = resolve(pkgDir, '.build');
const entry = resolve(buildDir, 'entry.css');
const output = resolve(pkgDir, 'dist/styles.css');

const antdReset = /^@import\s+['"]antd\/dist\/reset\.css['"][^;]*;\s*$/m;
const scanRoot = /source\(['"][^'"]*['"]\)/;

const globals = readFileSync(resolve(repoRoot, 'src/app/globals.css'), 'utf8');
if (!antdReset.test(globals) || !scanRoot.test(globals)) {
  throw new Error(
    'globals.css no longer matches the expected antd/source() lines; update build-css.mjs',
  );
}

const css = globals
  .replace(antdReset, '')
  .replace(scanRoot, `source('${resolve(repoRoot, 'src/components')}')`);

mkdirSync(buildDir, { recursive: true });
writeFileSync(entry, css);

try {
  const result = await postcss([tailwindcss()]).process(css, { from: entry, to: output });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, result.css);
  console.log(`styles.css: ${(result.css.length / 1024).toFixed(1)} kB`);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
