/**
 * Proof-of-failure tests for checkHostDeviceBoundaries.mjs — a gate that can't
 * fail is not a gate. Each test builds a fixture tree under a tmpdir and runs
 * the checker with --roots; allowlist fixtures pass --allowlist explicitly.
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

const allowlist = (edges) =>
  JSON.stringify({
    edges: edges.map((e) => ({
      scope: e.rule === 'web-closure' ? 'closure' : 'direct',
      owner: 'test',
      reason: 'fixture exemption',
      exit: 'fixture',
      ...e,
    })),
  });

const run = (dir, extra = []) => {
  try {
    const out = execFileSync('node', [SCRIPT, '--roots', dir, '--no-allowlist', ...extra], {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const runWithAllowlist = (dir, edges) => {
  const ap = path.join(dir, 'allowlist.json');
  fs.writeFileSync(ap, typeof edges === 'string' ? edges : allowlist(edges));
  try {
    const out = execFileSync('node', [SCRIPT, '--roots', dir, '--allowlist', ap], {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

// ---------------------------------------------------------------------------
// Positive fixtures — ordinary code keeps passing
// ---------------------------------------------------------------------------

test('clean fixture tree passes', () => {
  const dir = mk({
    'src/features/x.ts': "import { y } from './y'; export const x = y;",
    'src/features/y.ts': 'export const y = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
  assert.match(out, /PASS/);
});

test('ordinary deps, safe builtins, tsconfig aliases and workspace deps pass', () => {
  const dir = mk({
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    'packages/widgets/package.json': JSON.stringify({
      name: '@orvilo/widgets',
      exports: { '.': './src/index.ts', './extra': './src/extra.ts' },
    }),
    'packages/widgets/src/index.ts': 'export const w = 1;',
    'packages/widgets/src/extra.ts': 'export const e = 1;',
    'src/features/ok.ts': `import _ from 'lodash';
import path from 'node:path';
import { w } from '@orvilo/widgets';
import { e } from '@orvilo/widgets/extra';
import { u } from '@/utils/u';
export const x = [_, path.sep, w, e, u];`,
    'src/utils/u.ts': 'export const u = 1;',
    'apps/server/src/ok.ts': "import fs from 'node:fs'; export const f = fs.readFileSync;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
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

// ---------------------------------------------------------------------------
// Builtin coverage — every subpath of a banned builtin, node:-prefixed or not
// ---------------------------------------------------------------------------

test('banned builtin subpaths fail: node:fs/promises AND bare fs/promises', () => {
  const dir = mk({
    'src/features/a.ts': "import { readFile } from 'node:fs/promises'; export const r = readFile;",
    'src/features/b.ts': "import fs from 'fs/promises'; export const f = fs.readFile;",
    'src/features/c.ts': "import os from 'os'; export const o = os;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/a\.ts imports builtin:fs\/promises/);
  assert.match(out, /shared-to-native: src\/features\/b\.ts imports builtin:fs\/promises/);
  assert.match(out, /shared-to-native: src\/features\/c\.ts imports builtin:os/);
});

// ---------------------------------------------------------------------------
// Every import form is followed — .mjs/.cjs, dynamic, require, re-export
// ---------------------------------------------------------------------------

test('shared feature importing child_process fails (planted violation)', () => {
  const dir = mk({
    'src/features/evil.ts':
      "import { spawn } from 'node:child_process'; export const go = () => spawn('ls');",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/evil\.ts imports builtin:child_process/);
});

test('.mjs and .cjs files are scanned and their edges resolved', () => {
  const dir = mk({
    'src/features/evil.mjs': "import { x } from '../../apps/desktop/src/main/x.cjs'; export { x };",
    'apps/desktop/src/main/x.cjs':
      "const { execSync } = require('node:child_process'); module.exports = { x: execSync };",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(
    out,
    /shared-to-native: src\/features\/evil\.mjs imports file:apps\/desktop\/src\/main\/x\.cjs/,
  );
});

test('dynamic import() and require() are followed', () => {
  const dir = mk({
    'src/features/lazy.ts': "export const load = () => import('node:fs/promises');",
    'src/features/req.ts': "const cp = require('node:child_process'); export { cp };",
    'src/features/jestish.ts': "vi.mock('node:os'); export const m = 1;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/lazy\.ts imports builtin:fs\/promises/);
  assert.match(out, /shared-to-native: src\/features\/req\.ts imports builtin:child_process/);
  assert.match(out, /shared-to-native: src\/features\/jestish\.ts imports builtin:os/);
});

test('barrel re-export chains surface the banned edge on the barrel', () => {
  const dir = mk({
    'src/features/a.ts': "import { x } from '../libs/barrel'; export const a = x;",
    'src/libs/barrel.ts': "export * from '../../apps/desktop/src/main/x';",
    'apps/desktop/src/main/x.ts': 'export const x = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(
    out,
    /shared-to-native: src\/libs\/barrel\.ts imports file:apps\/desktop\/src\/main\/x\.ts/,
  );
});

// ---------------------------------------------------------------------------
// Indirection — workspace packages and exports subpaths are really resolved
// ---------------------------------------------------------------------------

test('cross-package indirection reaching Electron impl fails', () => {
  const dir = mk({
    // like @orvilo/desktop-ipc-typings: the desktop main dir is itself a package
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - 'apps/desktop/src/main'\n",
    'apps/desktop/src/main/package.json': JSON.stringify({
      name: '@orvilo/desktop-ipc-typings',
      exports: { '.': './exports.ts' },
    }),
    'apps/desktop/src/main/exports.ts':
      "import { app } from 'electron'; export type T = typeof app;",
    'src/features/evil.ts':
      "import type { T } from '@orvilo/desktop-ipc-typings'; export const x: T | null = null;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(
    out,
    /shared-to-native: src\/features\/evil\.ts imports file:apps\/desktop\/src\/main\/exports\.ts/,
  );
});

test('package exports subpath inside web entry closure fails', () => {
  const dir = mk({
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    'packages/spawn/package.json': JSON.stringify({
      name: '@orvilo/spawn',
      exports: { '.': './src/index.ts', './native': './src/native.ts' },
    }),
    'packages/spawn/src/index.ts': "export * from './native';",
    'packages/spawn/src/native.ts':
      "import cp from 'node:child_process'; export const s = cp.spawn;",
    'src/spa/entry.web.tsx': "import '@orvilo/spawn/native';",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /web-closure: packages\/spawn\/src\/native\.ts imports builtin:child_process/);
});

// ---------------------------------------------------------------------------
// Aliases + loud failure on unresolvable runtime specifiers
// ---------------------------------------------------------------------------

test('tsconfig alias into apps/desktop fails; missing alias target fails loudly', () => {
  const dir = mk({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        paths: { '@/native': ['apps/desktop/src/main/x.ts'], '@/*': ['./src/*'] },
      },
    }),
    'src/features/evil.ts': "import { x } from '@/native'; export { x };",
    'apps/desktop/src/main/x.ts': 'export const x = 1;',
    'src/features/missing.ts': "import { y } from '@/nope/y'; export const yy = y;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(
    out,
    /shared-to-native: src\/features\/evil\.ts imports file:apps\/desktop\/src\/main\/x\.ts/,
  );
  assert.match(out, /unresolved: src\/features\/missing\.ts imports unresolved:@\/nope\/y/);
});

test('extends-inherited tsconfig paths resolve against the PARENT config dir', () => {
  const dir = mk({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@/*': ['./src/*'], '@/server/*': ['./apps/server/src/*'] } },
    }),
    'apps/server/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.json' }),
    'apps/server/src/db.ts': 'export const db = 1;',
    'src/features/evil.ts': "import cp from 'node:child_process'; export const s = cp.spawn;",
    'apps/server/src/handler.ts': "import { db } from '@/server/db'; export const h = db;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1, out);
  assert.doesNotMatch(out, /unresolved.*@\/server\/db/);
  assert.match(out, /shared-to-native: src\/features\/evil\.ts/);
});

test('unresolvable relative specifier on a checked path fails loudly', () => {
  const dir = mk({
    'src/features/broken.ts': "import { x } from './does-not-exist'; export const b = x;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /unresolved: src\/features\/broken\.ts imports unresolved:\.\/does-not-exist/);
});

test('type-only unresolvable specifiers do not fail (bundlers erase them)', () => {
  const dir = mk({
    'apps/cli/src/client.ts':
      "import type { R } from '@/server/routers/lambda'; export const c: R | null = null;",
  });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
});

// ---------------------------------------------------------------------------
// Allowlist v2 — precise edges, no global target exemptions, staleness
// ---------------------------------------------------------------------------

test('a NEW importer hitting an exempted target fails', () => {
  const dir = mk({
    'src/features/old.ts': "import fs from 'node:fs'; export const f = fs;",
    'src/features/new.ts': "import fs from 'node:fs'; export const f2 = fs;",
  });
  const { code, out } = runWithAllowlist(dir, [
    { rule: 'shared-to-native', importer: 'src/features/old.ts', target: 'builtin:fs' },
  ]);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/new\.ts imports builtin:fs/);
  assert.doesNotMatch(out, /shared-to-native: src\/features\/old\.ts imports builtin:fs/);
});

test('a NEW banned target from an exempted importer fails', () => {
  const dir = mk({
    'src/features/old.ts':
      "import fs from 'node:fs'; import cp from 'node:child_process'; export const f = [fs, cp];",
  });
  const { code, out } = runWithAllowlist(dir, [
    { rule: 'shared-to-native', importer: 'src/features/old.ts', target: 'builtin:fs' },
  ]);
  assert.equal(code, 1);
  assert.match(out, /shared-to-native: src\/features\/old\.ts imports builtin:child_process/);
});

test('an exempted edge that vanishes is stale and fails the run', () => {
  const dir = mk({
    'src/features/clean.ts': 'export const c = 1;',
  });
  const { code, out } = runWithAllowlist(dir, [
    { rule: 'shared-to-native', importer: 'src/features/clean.ts', target: 'builtin:fs' },
  ]);
  assert.equal(code, 1);
  assert.match(out, /stale allowlist/);
});

test('v1 files-format allowlists are rejected outright', () => {
  const dir = mk({ 'src/features/x.ts': 'export const x = 1;' });
  const { code, out } = runWithAllowlist(dir, JSON.stringify({ files: {} }));
  assert.equal(code, 1);
  assert.match(out, /retired v1 `files` format/);
});

test('an exempted web-closure edge passes; a sibling edge still fails', () => {
  const dir = mk({
    'src/spa/entry.web.tsx': "import './a'; import './b';",
    'src/spa/a.ts': "import os from 'node:os'; export const o = os;",
    'src/spa/b.ts': "import cp from 'node:child_process'; export const c = cp;",
  });
  const { code, out } = runWithAllowlist(dir, [
    { rule: 'web-closure', importer: 'src/spa/a.ts', target: 'builtin:os', scope: 'closure' },
  ]);
  assert.equal(code, 1);
  assert.doesNotMatch(out, /web-closure: src\/spa\/a\.ts/);
  assert.match(out, /web-closure: src\/spa\/b\.ts imports builtin:child_process/);
});

// ---------------------------------------------------------------------------
// Scoped rules (existing coverage, updated to normalized target strings)
// ---------------------------------------------------------------------------

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
  assert.match(out, /web-closure: src\/spa\/chain\.ts imports builtin:child_process/);
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
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    'packages/types/src/evil.ts': "import os from 'node:os'; export const o = os;",
    'packages/types/src/climb.ts': "import { x } from '@/utils/x'; export { x };",
    'src/utils/x.ts': 'export const x = 1;',
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /types-purity: packages\/types\/src\/evil\.ts imports builtin:os/);
  assert.match(out, /types-purity: packages\/types\/src\/climb\.ts imports file:src\/utils\/x\.ts/);
});
