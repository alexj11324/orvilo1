#!/usr/bin/env node
/**
 * Bundle the harness runner into a single artifact.
 *
 *   node scripts/build.mjs
 *
 * Resolves `@earendil-works/*` imports to the vendored upstream sources under
 * vendor/prime/packages/<name>/src (the vendored lockfile already `npm ci`-ed
 * their npm dependencies into vendor/prime/node_modules, which esbuild
 * resolves normally). Output: dist/runner.mjs — the single file
 * `verifyArtifact` hashes before the supervisor launches it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';

import * as esbuild from 'esbuild';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PKG = path.resolve(HERE, '..');
const ROOT = path.resolve(PKG, '../..');
const VENDOR = path.join(ROOT, 'vendor/prime');

const PI_PACKAGES = {
  '@earendil-works/pi-ai': 'ai',
  '@earendil-works/pi-agent-core': 'agent',
  '@earendil-works/pi-coding-agent': 'coding-agent',
  '@earendil-works/pi-tui': 'tui',
};

/** Alias `@earendil-works/<pkg>[/*]` → vendor/prime/packages/<dir>/src[/*]. */
const vendorAlias = {
  name: 'vendor-prime-alias',
  setup(build) {
    build.onResolve({ filter: /^@earendil-works\// }, (args) => {
      const segments = args.path.split('/');
      const name = segments.slice(0, 2).join('/');
      const subpath = segments.slice(2).join('/');
      const dir = PI_PACKAGES[name];
      if (!dir) return undefined; // not a vendored package — resolve normally
      const base = path.join(VENDOR, 'packages', dir, 'src');
      const candidate = path.join(base, subpath);
      // TS source uses ESM .js specifiers that map to .ts files.
      const candidates = subpath
        ? [
            candidate,
            `${candidate}.ts`,
            candidate.replace(/\.js$/, '.ts'),
            path.join(candidate, 'index.ts'),
          ]
        : [path.join(base, 'index.ts')];
      for (const file of candidates) {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) return { path: file };
      }
      return { errors: [{ text: `unresolvable vendored specifier: ${args.path}` }] };
    });
  },
};

/** Third-party deps imported by vendored files resolve upward into
 * vendor/prime/node_modules on their own; this fallback only covers direct
 * imports from the runner's own sources (none today — kept as a safety net). */
const vendorNodeModules = {
  name: 'vendor-node-modules',
  setup(build) {
    const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
    build.onResolve({ filter: /^[a-z@]/i }, (args) => {
      if (args.path.startsWith('@orvilo/') || args.path.startsWith('@earendil-works/'))
        return undefined;
      if (builtins.has(args.path)) return { path: args.path, external: true };
      try {
        const require = createRequire(path.join(VENDOR, 'package.json'));
        const resolved = require.resolve(args.path);
        // Node builtins resolve to bare names — mark external.
        if (!path.isAbsolute(resolved)) return { path: args.path, external: true };
        return { path: resolved };
      } catch {
        return undefined;
      }
    });
  },
};

const entry = path.join(PKG, 'src/runner.ts');
const outfile = path.join(PKG, 'dist/runner.mjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile,
  plugins: [vendorAlias, vendorNodeModules],
  // Upstream uses non-literal dynamic imports for node-only providers; the
  // runner registers only 'orvilo-broker', so those code paths are unreachable.
  logLevel: 'warning',
  banner: {
    js: [
      '// @orvilo/prime-harness runner — bundled from vendor/prime @ 7d442aa',
      // Vendored npm deps ship CJS `require()`; give esbuild's shim a real one.
      "import { createRequire as __orviloCreateRequire } from 'node:module';",
      'const require = __orviloCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  metafile: true,
});

const sha = createHash('sha256').update(fs.readFileSync(outfile)).digest('hex');
const bytes = fs.statSync(outfile).size;
console.log(`dist/runner.mjs: ${bytes} bytes, sha256:${sha}`);
