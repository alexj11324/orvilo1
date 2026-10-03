/**
 * Proof-of-failure tests for checkHostDeviceBoundaries.mjs — a gate that can't
 * fail is not a gate. Each test builds a fixture tree under a tmpdir and runs
 * the checker with --roots/--no-allowlist.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, 'checkHostDeviceBoundaries.mjs');

const mk = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdb-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
};

const run = (dir) => {
  try {
    const out = execFileSync('node', [SCRIPT, '--roots', dir, '--no-allowlist'], {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

test('clean fixture tree passes', () => {
  const dir = mk({
    'src/features/x.ts': "import { y } from './y'; export const x = y;",
    'src/features/y.ts': 'export const y = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
  assert.match(out, /PASS/);
});

test('shared feature importing child_process fails (planted violation)', () => {
  const dir = mk({
    'src/features/evil.ts':
      "import { spawn } from 'node:child_process'; export const go = () => spawn('ls');",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/evil\.ts imports builtin:node:child_process/);
});

test('shared feature importing apps/desktop impl fails transitively', () => {
  const dir = mk({
    'src/features/evil.ts': "import { foo } from '../../apps/desktop/src/main/x'; export { foo };",
    'apps/desktop/src/main/x.ts': "import { app } from 'electron'; export const foo = app;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/evil\.ts/);
});

test('web entry closure reaching exec builtin fails', () => {
  const dir = mk({
    'src/spa/entry.web.tsx': "import './chain';",
    'src/spa/chain.ts': "import { exec } from 'child_process'; export const e = exec;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /web-closure: src\/spa\/chain\.ts -> builtin:child_process/);
});

test('apps/server importing apps/desktop fails; builtin use alone does not', () => {
  const dir = mk({
    'apps/server/src/ok.ts': "import fs from 'node:fs'; export const f = fs;",
    'apps/server/src/evil.ts': "import { x } from '../../desktop/src/main/x'; export { x };",
    'apps/desktop/src/main/x.ts': 'export const x = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /server-cli: apps\/server\/src\/evil\.ts/);
  assert.doesNotMatch(out, /apps\/server\/src\/ok\.ts/);
});

test('packages/types pulling node builtins or app code fails', () => {
  const dir = mk({
    'packages/types/src/evil.ts': "import os from 'node:os'; export const o = os;",
    'packages/types/src/climb.ts': "import { x } from '@/utils/x'; export { x };",
    'src/utils/x.ts': 'export const x = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /types-purity: packages\/types\/src\/evil\.ts imports builtin:node:os/);
  assert.match(out, /types-purity: packages\/types\/src\/climb\.ts imports file:src\/utils\/x\.ts/);
});

test('isDesktop outside adapter roots fails; inside passes', () => {
  const dir = mk({
    'src/features/bad.ts': "import { isDesktop } from '@orvilo/const'; export const x = isDesktop;",
    'src/platform/host.ts':
      "import { isDesktop } from '@orvilo/const'; export const h = isDesktop;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /isdesktop-census: src\/features\/bad\.ts/);
  assert.doesNotMatch(out, /src\/platform\/host\.ts uses/);
});
