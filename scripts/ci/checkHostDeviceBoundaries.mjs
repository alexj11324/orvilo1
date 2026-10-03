#!/usr/bin/env node
/**
 * Host/device boundary gate (WD-06, web–desktop convergence plan §8).
 *
 * Checks the real import graph (static + dynamic + re-export), not emitted
 * strings:
 *
 *   shared-to-native   — shared product code (src/features, src/components,
 *                        src/store, src/services … minus declared host
 *                        adapters) must not reach Electron implementations,
 *                        the `electron` package family, node exec builtins
 *                        (child_process/fs/process/os), or apps/desktop/*.
 *   web-closure        — the web SPA entry closure (entry.web / entry.mobile /
 *                        entry.popup / entry.auth) must not reach the same
 *                        native set.
 *   server-cli         — apps/server + apps/cli must not reach apps/desktop or
 *                        Electron app modules.
 *   types-purity       — packages/types + packages/app-config must not import
 *                        node builtins or climb into src/ / apps/ (a barrel
 *                        that pulls side-effectful Node code defeats tree-shaking
 *                        and drags host code into every consumer).
 *   isdesktop-census   — `isDesktop` / `__ELECTRON__` in shared src/ is only
 *                        legal in composition roots, host adapters and
 *                        owner-tagged allowlisted files. New violations fail;
 *                        allowlisted count regressions fail (shrinking cap).
 *
 * Exemptions live in scripts/ci/hostDeviceBoundariesAllowlist.json — every
 * entry carries the owning work package, a reason and an exit expectation.
 *
 * Usage:
 *   node scripts/ci/checkHostDeviceBoundaries.mjs                 # full repo
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --roots <dir>   # fixture tree (tests)
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --no-allowlist  # ignore allowlist (tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/ci/hostDeviceBoundariesAllowlist.json');

const args = process.argv.slice(2);
const scanRoot = args.includes('--roots') ? path.resolve(args[args.indexOf('--roots') + 1]) : ROOT;
const useAllowlist = !args.includes('--no-allowlist') && scanRoot === ROOT;

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

const SOURCE_DIRS = ['src', 'apps', 'packages'];
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx)$/;
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '__tests__',
  '__fixtures__',
  '__mocks__',
  'e2e',
]);
const SKIP_FILE = /\.(?:test|spec|stories|d)\.[jt]sx?$/;

/** Modules that prove a file reached native execution — never legal in shared code. */
const BANNED_BUILTINS = new Set([
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'process',
  'node:process',
  'os',
  'node:os',
]);
const BANNED_PACKAGE =
  /^(?:electron|electron-updater|electron-log|electron-store|electron-util|update-electron-app)(?:\/|$)/;
/** Repo-relative prefixes that are native-host implementation. */
const BANNED_PATH = /^apps\/desktop\//;

/** Shared product surface subject to the native-reach ban. */
const SHARED_PREFIX =
  /^src\/(?:features|components|store|services|hooks|utils|libs|layout|locales|providers|routes)\//;
/** Paths inside shared src/ that ARE the declared host-adapter layer. */
const ADAPTER_PATH =
  /(?:^|\/)(?:platform|services\/electron)\/|\.desktop\.[jt]sx?$|^src\/spa\/entry\.desktop\.|^src\/spa\/.*Desktop|^src\/desktop\//;

const WEB_ENTRIES = [
  'src/spa/entry.web.tsx',
  'src/spa/entry.mobile.tsx',
  'src/spa/entry.popup.tsx',
  'src/spa/entry.auth.tsx',
];
const SERVER_CLI_PREFIX = /^apps\/(?:server|cli)\//;
const PURE_PACKAGES_PREFIX = /^packages\/(?:types|app-config)\//;

// ---------------------------------------------------------------------------
// Specifier extraction
// ---------------------------------------------------------------------------

const stripComments = (source) =>
  source.replaceAll(/\/\*.*?\*\//gs, (m) => ' '.repeat(m.length)).replaceAll(/\/\/[^\n]*/g, '');

// import ... from 'x' | export ... from 'x' | import 'x' | import('x') | require('x')
const SPEC_RE =
  /(?:^|[\s;{}])(?:from|import|export)[^'"`]*?from\s*['"`]([^'"`\n]+)['"`]|(?:^|[\s;])import\s*['"`]([^'"`\n]+)['"`]|import\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)|require\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/g;

const extractSpecifiers = (source) => {
  const specs = [];
  const clean = stripComments(source);
  for (const m of clean.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (spec) specs.push(spec);
  }
  return specs;
};

// ---------------------------------------------------------------------------
// Resolution (mirrors tsconfig paths + workspace layout; no new deps)
// ---------------------------------------------------------------------------

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx'];
const INDEXES = EXTENSIONS.map((e) => `index${e}`);

/** `@/x` alias table, ordered longest-prefix-first (from tsconfig.json). */
const ALIASES = [
  ['@/database/', 'packages/database/src/'],
  ['@/const/', 'packages/const/src/', 'src/const/'],
  ['@/utils/', 'packages/utils/src/', 'src/utils/'],
  ['@/types/', 'packages/types/src/', 'src/types/'],
  ['@/envs/', 'packages/env/src/', 'src/envs/'],
  ['@/libs/trpc/', 'packages/trpc/src/', 'src/libs/trpc/'],
  ['@/config/', 'packages/app-config/src/', 'src/config/'],
  ['@/locales/', 'packages/locales/src/', 'src/locales/'],
  ['@/business/server/', 'packages/business-server/src/', 'src/business/server/'],
  ['@/server/', 'apps/server/src/'],
  ['@/', 'src/'],
];

const exists = (abs) => {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
};

const resolveFile = (rel) => {
  const abs = path.join(scanRoot, rel);
  for (const ext of EXTENSIONS) if (exists(abs + ext)) return rel + ext;
  if (SOURCE_EXT.test(rel) && exists(abs)) return rel;
  for (const idx of INDEXES) {
    const cand = `${rel.replace(/\/$/, '')}/${idx}`;
    if (exists(path.join(scanRoot, cand))) return cand;
  }
  return null;
};

const resolveSpecifier = (fromFile, spec) => {
  if (spec.startsWith('node:') || BANNED_BUILTINS.has(spec)) return `builtin:${spec}`;
  if (BANNED_PACKAGE.test(spec)) return `pkg:${spec.split('/')[0]}`;
  if (spec.startsWith('@orvilo/')) {
    const name = spec.slice('@orvilo/'.length).split('/')[0];
    const sub = spec.slice(`@orvilo/${name}`.length).replace(/^\/(src\/?)?/, '');
    const hit =
      resolveFile(`packages/${name}/src/${sub}`) ?? resolveFile(`packages/${name}/src/index`);
    return hit ? `file:${hit}` : `pkg:@orvilo/${name}`;
  }
  if (spec.startsWith('@/')) {
    for (const alias of ALIASES) {
      const [prefix, ...targets] = alias;
      if (!spec.startsWith(prefix)) continue;
      for (const t of targets) {
        const hit = resolveFile(t + spec.slice(prefix.length));
        if (hit) return `file:${hit}`;
      }
      return null; // alias matched but unresolvable (asset, css, generated)
    }
    return null;
  }
  if (spec.startsWith('.')) {
    const base = path.posix.dirname(fromFile);
    const joined = path.posix.normalize(path.posix.join(base, spec));
    if (joined.startsWith('..')) return null; // escapes scan root
    const hit = resolveFile(joined);
    return hit ? `file:${hit}` : null;
  }
  return `pkg:${spec.split('/')[0]}`; // external package — not walked
};

// ---------------------------------------------------------------------------
// Graph build
// ---------------------------------------------------------------------------

const collectFiles = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIR.has(ent.name)) collectFiles(p, out);
    } else if (SOURCE_EXT.test(ent.name) && !SKIP_FILE.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
};

const buildGraph = () => {
  const files = [];
  for (const d of SOURCE_DIRS) {
    const abs = path.join(scanRoot, d);
    if (fs.existsSync(abs)) collectFiles(abs, files);
  }
  /** file → { edges: Set<resolved>, sources: Map<spec, resolved> } */
  const graph = new Map();
  for (const abs of files) {
    const rel = path.relative(scanRoot, abs).split(path.sep).join('/');
    let source;
    try {
      source = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const edges = new Set();
    for (const spec of extractSpecifiers(source)) {
      const r = resolveSpecifier(rel, spec);
      if (r) edges.add(r);
    }
    graph.set(rel, edges);
  }
  return graph;
};

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

/** Native-host implementation — illegal to reach from shared code AND server/cli. */
const isNativeImpl = (target) => {
  if (target.startsWith('pkg:')) return BANNED_PACKAGE.test(target.slice(4) + '/');
  if (target.startsWith('file:')) return BANNED_PATH.test(target.slice(5));
  return false;
};

/** Native impl + exec builtins — illegal from shared code and web closure. */
const isNativeOrExec = (target) =>
  isNativeImpl(target) || (target.startsWith('builtin:') && BANNED_BUILTINS.has(target.slice(8)));

/** Forward-BFS from entry points; returns banned targets hit. */
const closureBanned = (graph, entries, seedPredicate) => {
  const seen = new Set();
  const banned = new Set();
  const queue = entries.filter((e) => graph.has(e));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const e of graph.get(file) ?? []) {
      if (seedPredicate(e)) banned.add(`${file} -> ${e}`);
      if (e.startsWith('file:') && !seen.has(e.slice(5))) queue.push(e.slice(5));
    }
  }
  return banned;
};

// ---------------------------------------------------------------------------
// isDesktop / __ELECTRON__ census
// ---------------------------------------------------------------------------

const IS_DESKTOP_RE = /\bisDesktop\b|__ELECTRON__/g;
const CENSUS_ALLOWED =
  /^src\/(?:spa|platform|desktop)\/|\.desktop\.[jt]sx?$|^src\/services\/electron\//;

const census = () => {
  const hits = new Map(); // file -> count
  for (const d of ['src']) {
    const abs = path.join(scanRoot, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of collectFiles(abs)) {
      const rel = path.relative(scanRoot, f).split(path.sep).join('/');
      const n = (stripComments(fs.readFileSync(f, 'utf8')).match(IS_DESKTOP_RE) ?? []).length;
      if (n > 0) hits.set(rel, n);
    }
  }
  return hits;
};

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

const loadAllowlist = () => {
  if (!useAllowlist) return { files: {} };
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch {
    return { files: {} };
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  const graph = buildGraph();
  const allow = loadAllowlist();
  const allowed = allow.files ?? {};
  const usedAllow = new Set();
  const violations = [];

  const exempt = (rule, file) => {
    const entry = allowed[file];
    if (entry?.rules?.includes(rule)) {
      usedAllow.add(file);
      return true;
    }
    return false;
  };

  // Rule 1 + 3: crossing edges — a shared / server / cli file with a DIRECT
  // import into the banned zone is where the boundary is breached. Transitive
  // reach propagates through legal-looking chains, but the sin lives at the
  // edge; allowlisting the edge owns the debt and names its fixer.
  //   shared scope    -> native impl OR exec builtins   (shared-to-native)
  //   apps/server|cli -> apps/desktop / electron impl   (server-cli)
  for (const [file, edges] of graph) {
    if (ADAPTER_PATH.test(file) || BANNED_PATH.test(file)) continue;
    const shared = SHARED_PREFIX.test(file);
    const serverCli = SERVER_CLI_PREFIX.test(file);
    if (!shared && !serverCli) continue;
    for (const e of edges) {
      if (shared && isNativeOrExec(e) && !exempt('shared-to-native', file))
        violations.push(`shared-to-native: ${file} imports ${e}`);
      if (serverCli && isNativeImpl(e) && !exempt('server-cli', file))
        violations.push(`server-cli: ${file} imports ${e}`);
    }
  }

  // Rule 2: web entry closure — banned seeds actually reachable from the web
  // entries (what the bundle would contain), allowlisted per-seed so a NEW
  // module entering the closure fails while existing debt stays visible.
  for (const edge of closureBanned(graph, WEB_ENTRIES, isNativeOrExec)) {
    const file = edge.split(' -> ')[0];
    const seed = edge.split(' -> ').pop();
    const seedKey = `seed:${seed}`;
    if (allowed[seedKey]) {
      usedAllow.add(seedKey);
    } else if (!exempt('web-closure', file)) {
      violations.push(`web-closure: ${edge}`);
    }
  }

  // Rule 4: contract-package purity — no builtins, no climb into src//apps.
  for (const [file, edges] of graph) {
    if (!PURE_PACKAGES_PREFIX.test(file)) continue;
    for (const e of edges) {
      const badBuiltin = e.startsWith('builtin:') && BANNED_BUILTINS.has(e.slice(8));
      const climb =
        e.startsWith('file:') &&
        (/^src\//.test(e.slice(5)) ||
          /^apps\//.test(e.slice(5)) ||
          (/^packages\//.test(e.slice(5)) &&
            !PURE_PACKAGES_PREFIX.test(e.slice(5)) &&
            BANNED_PATH.test(e.slice(5))));
      if ((badBuiltin || climb) && !exempt('types-purity', file))
        violations.push(`types-purity: ${file} imports ${e}`);
    }
  }

  // Rule 5: census.
  const hits = census();
  let censusTotal = 0;
  for (const [file, n] of hits) {
    censusTotal += n;
    if (CENSUS_ALLOWED.test(file)) continue;
    const entry = allowed[file];
    if (entry?.isDesktopMax !== undefined) {
      usedAllow.add(file);
      if (n > entry.isDesktopMax)
        violations.push(
          `isdesktop-census: ${file} has ${n} isDesktop/__ELECTRON__ usages, allowlist cap ${entry.isDesktopMax}`,
        );
      continue;
    }
    violations.push(
      `isdesktop-census: ${file} uses isDesktop/__ELECTRON__ (${n}x) outside adapter roots`,
    );
  }

  // Stale allowlist entries warn, never fail.
  const stale = Object.keys(allowed).filter((f) => !usedAllow.has(f));

  const fileCount = graph.size;
  console.log(
    `host/device boundary gate — ${fileCount} files scanned under ${scanRoot === ROOT ? 'repo' : scanRoot}`,
  );
  console.log(
    `isDesktop/__ELECTRON__ census: ${censusTotal} usages in ${hits.size} files (shared src/)`,
  );
  if (stale.length)
    console.log(
      `stale allowlist entries (informational): ${stale.length}\n  ${stale.join('\n  ')}`,
    );
  if (violations.length) {
    console.error(
      `\nFAIL — ${violations.length} boundary violation(s):\n  ${violations.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log('PASS — no boundary violations');
};

main();
