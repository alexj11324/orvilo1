import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const missing = new Set();
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(filename);
    else if (entry.name.endsWith('.js')) {
      for (const { fileName: specifier } of ts.preProcessFile(await readFile(filename, 'utf8'))
        .importedFiles) {
        if (specifier.startsWith('.') || specifier.startsWith('/') || isBuiltin(specifier))
          continue;
        const name = specifier
          .split('/')
          .slice(0, specifier.startsWith('@') ? 2 : 1)
          .join('/');
        if (!manifest.dependencies?.[name]) missing.add(name);
      }
    }
  }
}
await check(path.join(root, 'dist'));
assert.equal(missing.size, 0, `Undeclared production dependencies: ${[...missing].join(', ')}`);
console.info('Every external import in the server artifact has a declared production dependency.');
