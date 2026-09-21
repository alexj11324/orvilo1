#!/usr/bin/env node
/**
 * Slimming census — regenerable capability + dependency-closure inventory.
 *
 *   node scripts/slimming/census.mjs          # writes docs/development/slimming/{census.json,CENSUS.md}
 *   node scripts/slimming/census.mjs --check  # same, but exits 1 on any boundary violation
 *                                             # (CI gate — see evaluateCheck)
 *
 * Strict gate (`--check`, ORV-116) fails on:
 *   - uncovered source files > 0            (every file must belong to a capability)
 *   - conflicting dispositions > 0          (one file claimed by caps with different dispositions)
 *   - INVESTIGATE capabilities > 0          (no permanent limbo)
 *   - DELETE capabilities with files > 0    (deleted means deleted)
 *   - unexplained inbound deps on DELETE    (existing closure rule)
 *   - unresolved internal imports > 0       (minus boundary.importExceptions entries)
 *
 * Inputs:
 *   - scripts/slimming/boundary.json  (authored dispositions — the KEEP/DELETE ledger source of truth)
 *   - the working tree               (imports, routes, routers, stores, schemas, locales, tests, docs)
 *
 * Disposition vocabulary: KEEP / REWRITE_FOR_ACP / DELETE / INVESTIGATE.
 * A DELETE capability is "closure-clean" when every file importing into its file set is itself
 * inside a DELETE or INVESTIGATE capability — anything else is an unexplained inbound dependency.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BOUNDARY_PATH = path.join(ROOT, 'scripts/slimming/boundary.json');
const OUT_DIR = path.join(ROOT, 'docs/development/slimming');
const CHECK = process.argv.includes('--check');

const SOURCE_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const SCAN_DIRS = ['src', 'apps', 'packages', 'plugins', 'e2e', 'tests', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'out',
  'coverage',
  '.git',
  'public',
  'tmp',
]);

// ---------- glob → regex (supports **, *, ?, {a,b}, [x]) ----------
function globToRegexStr(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (glob[i] === '/') i += 1;
        continue;
      }
      re += '[^/]*';
      i += 1;
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      const inner = glob
        .slice(i + 1, end)
        .split(',')
        .map((p) => globToRegexStr(p));
      re += `(?:${inner.join('|')})`;
      i = end + 1;
    } else if (c === '[' || c === ']') {
      // dynamic route segments ([param]) are literal directory names here — never char classes
      re += `\\${c}`;
      i += 1;
    } else {
      re += c.replaceAll(/[.*+?^${}()|\\]/g, '\\$&');
      i += 1;
    }
  }
  return re;
}
const globToRegex = (glob) => new RegExp(`^${globToRegexStr(glob)}$`);

// ---------- filesystem walk ----------
function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p);
    } else {
      yield p;
    }
  }
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(p);

// ---------- workspace packages ----------
function loadWorkspacePackages() {
  const pkgs = new Map(); // name -> {dir, manifest}
  for (const base of ['packages', 'apps']) {
    const baseAbs = path.join(ROOT, base);
    if (!exists(baseAbs)) continue;
    const stack = [baseAbs];
    while (stack.length) {
      const dir = stack.pop();
      const manifestPath = path.join(dir, 'package.json');
      if (exists(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          // duplicate names exist on purpose (e.g. apps/desktop/stubs/* shadow
          // real packages for bundling) — keep every candidate and try each
          // at resolution time.
          if (manifest.name) {
            if (!pkgs.has(manifest.name)) pkgs.set(manifest.name, []);
            pkgs.get(manifest.name).push({ dir: rel(dir), manifest });
          }
        } catch {
          /* ignore malformed manifests */
        }
      }
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
          stack.push(path.join(dir, e.name));
      }
    }
  }
  // workspace root
  try {
    const rootManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (rootManifest.name) {
      if (!pkgs.has(rootManifest.name)) pkgs.set(rootManifest.name, []);
      pkgs.get(rootManifest.name).push({ dir: '.', manifest: rootManifest });
    }
  } catch {
    /* root manifest optional */
  }
  return pkgs;
}

// ---------- import extraction ----------
const IMPORT_RE =
  /(?:import|export)[\s\S]{0,400}?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

function extractSpecifiers(file) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const specs = [];
  // strip line/block comments so commented-out imports don't register —
  // they are documentation, not dependencies. Runs char-wise to preserve
  // string literals that merely contain '//' or '/*'.
  {
    let out = '';
    let i = 0;
    const n = src.length;
    let inStr = 0; // 0 none, 1 ', 2 ", 3 `
    while (i < n) {
      const ch = src[i];
      const next = src[i + 1];
      if (inStr) {
        out += ch;
        if (ch === '\\') {
          out += next || '';
          i += 2;
          continue;
        }
        if (
          (inStr === 1 && ch === "'") ||
          (inStr === 2 && ch === '"') ||
          (inStr === 3 && ch === '`')
        )
          inStr = 0;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inStr = 1;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inStr = 2;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '`') {
        inStr = 3;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '/') {
        while (i < n && src[i] !== '\n') i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    src = out;
  }
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (spec) specs.push(spec);
  }
  return specs;
}

// ---------- resolver ----------
// Per-area alias scopes: a file under DIR_PREFIX resolves ALIAS_PREFIX against
// the listed targets (in order). Covers apps/desktop's own tsconfig paths
// (`@/* -> src/main/*`, `~common/* -> src/common/*`) layered over the root ones.
const AREA_ALIAS_SCOPES = [
  {
    dirPrefix: 'apps/desktop/src/main/',
    aliases: [
      ['@/', ['apps/desktop/src/main/']],
      ['~common/', ['apps/desktop/src/common/']],
    ],
  },
];

const ROOT_ALIASES = [
  ['@/database/', ['packages/database/src/']],
  ['@/const/', ['packages/const/src/', 'src/const/']],
  ['@/utils/', ['packages/utils/src/', 'src/utils/']],
  ['@/types/', ['packages/types/src/', 'src/types/']],
  ['@/envs/', ['packages/env/src/', 'src/envs/']],
  ['@/libs/trpc/', ['packages/trpc/src/', 'src/libs/trpc/']],
  ['@/config/', ['packages/app-config/src/', 'src/config/']],
  ['@/locales/', ['packages/locales/src/', 'src/locales/']],
  ['@/business/server/', ['packages/business-server/src/', 'src/business/server/']],
  ['@/server/', ['apps/server/src/']],
  ['@/', ['src/']],
  ['~test-utils', ['tests/utils.tsx']],
  ['~base-ui-stubs', ['tests/mocks/baseUiStubs.tsx']],
  ['lru_map', ['tests/mocks/lru_map']],
];

function resolveAsFile(candidate) {
  // strip bundler query suffixes (?raw, ?v=...) before probing
  candidate = candidate.replace(/[?#].*$/, '');
  const abs = path.join(ROOT, candidate);
  for (const ext of SOURCE_EXT) {
    if (exists(abs + ext)) return candidate + ext;
    if (exists(path.join(abs, 'index' + ext))) return candidate + '/index' + ext;
  }
  // declaration-only modules (*.d.ts)
  if (exists(abs + '.d.ts')) return candidate + '.d.ts';
  if (exists(abs)) {
    if (!fs.statSync(abs).isDirectory()) return candidate;
    // bare directory import — follow its package.json entry (packages/types)
    const pj = path.join(abs, 'package.json');
    if (exists(pj)) {
      try {
        const m = JSON.parse(fs.readFileSync(pj, 'utf8'));
        const e = m.exports?.['.'];
        const entry = typeof e === 'string' ? e : e?.import || e?.default || m.main;
        if (entry) {
          const hit = resolveAsFile(`${candidate}/${entry.replace(/^\.\//, '')}`);
          if (hit) return hit;
        }
      } catch {
        /* malformed manifest */
      }
      const hit = resolveAsFile(candidate + '/src/index');
      if (hit) return hit;
    }
  }
  return null;
}

function resolveSpecifier(spec, fromFile, pkgByName) {
  if (spec.startsWith('node:')) return { kind: 'builtin' };
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = path.posix.dirname(fromFile);
    const candidate = path.posix.normalize(path.posix.join(base, spec));
    const hit = resolveAsFile(candidate);
    return hit ? { kind: 'internal', file: hit } : { kind: 'unresolved', spec };
  }
  const areaScope = AREA_ALIAS_SCOPES.find((s) => fromFile.startsWith(s.dirPrefix));
  const aliasTable = areaScope ? [...areaScope.aliases, ...ROOT_ALIASES] : ROOT_ALIASES;
  for (const [prefix, targets] of aliasTable) {
    if (spec === prefix.slice(0, -1) || spec.startsWith(prefix)) {
      const rest = spec === prefix.slice(0, -1) ? '' : spec.slice(prefix.length);
      for (const target of targets) {
        const hit = resolveAsFile(target + rest);
        if (hit) return { kind: 'internal', file: hit };
      }
      return { kind: 'unresolved', spec };
    }
  }
  // workspace package by name (@orvilo/foo[/sub], or unscoped names like 'lodash' won't match unless workspace)
  const parts = spec.split('/');
  const names = spec.startsWith('@') ? [parts.slice(0, 2).join('/')] : [parts[0]];
  for (const name of names) {
    const candidates = pkgByName.get(name);
    if (candidates) {
      const sub = spec.slice(name.length).replace(/^\//, '');
      for (const pkg of candidates) {
        const baseDir = pkg.dir === '.' ? '' : pkg.dir + '/';
        const exportsMap = pkg.manifest.exports || {};
        // honor the package.json exports map for subpath imports
        // (@orvilo/foo/sub -> exports['./sub']), handling string and
        // conditional ({import,types,default}) entry forms.
        const exportEntry = (key) => {
          const e = exportsMap[key];
          if (!e) return null;
          if (typeof e === 'string') return e;
          return e.import || e.default || e.types || Object.values(e)[0];
        };
        const entry = sub
          ? exportEntry(`./${sub}`)
          : exportEntry('.') || pkg.manifest.main || 'src/index.ts';
        if (entry) {
          const hit = resolveAsFile(baseDir + entry.replace(/^\.\//, ''));
          if (hit) return { kind: 'internal', file: hit, package: name };
        }
        // try src/<sub>
        if (sub) {
          const hit2 = resolveAsFile(baseDir + 'src/' + sub);
          if (hit2) return { kind: 'internal', file: hit2, package: name };
        }
      }
      return { kind: 'workspace-unresolved', spec, package: name };
    }
  }
  return { kind: 'external', package: names[0] };
}

// ---------- enumerations ----------
function enumerateNextRoutes() {
  const routes = [];
  const appDir = path.join(ROOT, 'src/app');
  if (!exists(appDir)) return routes;
  for (const f of walk(appDir)) {
    const b = path.basename(f);
    if (/^(?:page|route|layout|loading|error)\.(?:tsx?|jsx?)$/.test(b)) {
      routes.push(rel(f));
    }
  }
  return routes;
}

function enumerateSpaRoutes() {
  const files = [
    'src/spa/router/desktopRouter.shared.tsx',
    'src/spa/router/desktopRouter.config.tsx',
    'src/spa/router/desktopRouter.config.desktop.tsx',
    'src/spa/router/mobileRouter.config.tsx',
    'src/spa/router/authRouter.config.tsx',
  ];
  const routePaths = [];
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!exists(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const re = /path:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) routePaths.push({ file: f, path: m[1] });
  }
  return routePaths;
}

function enumerateLambdaRouters() {
  const dir = path.join(ROOT, 'apps/server/src/routers/lambda');
  const routers = [];
  for (const f of walk(dir)) {
    if (/\.test\.|__tests__|_helpers|_schema|_template/.test(f)) continue;
    if (f.endsWith('.ts') || f.endsWith('.tsx')) routers.push(rel(f));
  }
  return routers.sort();
}

function enumerateDbTables() {
  const dir = path.join(ROOT, 'packages/database/src/schemas');
  const tables = [];
  if (!exists(dir)) return tables;
  const re = /pgTable(?:WithSchema)?\(\s*['"]([^'"]+)['"]/g;
  for (const f of walk(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) tables.push({ table: m[1], file: rel(f) });
  }
  return tables;
}

function countMigrations() {
  const candidates = ['packages/database/migrations', 'packages/database/drizzle'];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (exists(abs)) {
      const dirs = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory());
      const sql = [...walk(abs)].filter((f) => f.endsWith('.sql'));
      return { dir: c, migrationDirs: dirs.length, sqlFiles: sql.length };
    }
  }
  return { dir: null, migrationDirs: 0, sqlFiles: 0 };
}

function enumerateLocales() {
  const out = { localeDirs: {}, defaultNamespaces: [] };
  const locDir = path.join(ROOT, 'locales');
  if (exists(locDir)) {
    for (const e of fs.readdirSync(locDir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const files = [...walk(path.join(locDir, e.name))].filter((f) => f.endsWith('.json'));
        out.localeDirs[e.name] = files.length;
      }
    }
  }
  const defDir = path.join(ROOT, 'packages/locales/src/default');
  if (exists(defDir)) {
    out.defaultNamespaces = fs.readdirSync(defDir).filter((f) => f.endsWith('.ts'));
  }
  return out;
}

function enumerateDocs() {
  const docs = [];
  const dir = path.join(ROOT, 'docs');
  if (exists(dir)) for (const f of walk(dir)) if (/\.mdx?$/i.test(f)) docs.push(rel(f));
  return docs;
}

// ---------- main ----------
function main() {
  const boundary = JSON.parse(fs.readFileSync(BOUNDARY_PATH, 'utf8'));
  const pkgByName = loadWorkspacePackages();
  const baseSha = execSync('git rev-parse HEAD').toString().trim();
  const baseBranch = boundary.canonicalBaseBranch;

  // 1. scan all source files
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    if (!exists(abs)) continue;
    for (const f of walk(abs)) {
      if (SOURCE_EXT.includes(path.extname(f))) files.push(rel(f));
    }
  }
  files.sort();
  const fileSet = new Set(files);

  // 2. import graph
  const inbound = new Map(); // target file -> Set(importer)
  const externalDeps = new Map(); // package -> Set(importer file)
  const unresolved = [];
  for (const f of files) {
    for (const spec of extractSpecifiers(path.join(ROOT, f))) {
      const r = resolveSpecifier(spec, f, pkgByName);
      if (r.kind === 'internal') {
        if (fileSet.has(r.file)) {
          if (!inbound.has(r.file)) inbound.set(r.file, new Set());
          inbound.get(r.file).add(f);
        }
        if (r.package) {
          if (!externalDeps.has(r.package)) externalDeps.set(r.package, new Set());
          externalDeps.get(r.package).add(f);
        }
      } else if (r.kind === 'workspace-unresolved') {
        if (!externalDeps.has(r.package)) externalDeps.set(r.package, new Set());
        externalDeps.get(r.package).add(f);
        unresolved.push({
          importer: f,
          specifier: spec,
          via: 'workspace-subpath',
          package: r.package,
        });
      } else if (r.kind === 'external') {
        if (!externalDeps.has(r.package)) externalDeps.set(r.package, new Set());
        externalDeps.get(r.package).add(f);
      } else if (r.kind === 'unresolved') {
        unresolved.push({
          importer: f,
          specifier: spec,
          via: spec.startsWith('@/') || spec.startsWith('~') ? 'alias' : 'relative',
        });
      }
    }
  }

  // 3. capability file sets
  const capabilities = boundary.capabilities.map((cap) => {
    const matchers = cap.globs.map(globToRegex);
    const matched = files.filter((f) => matchers.some((re) => re.test(f)));
    const matchedSet = new Set(matched);
    // inbound: files importing INTO this capability's set
    const inboundFiles = new Map(); // importer -> targets[]
    for (const target of matched) {
      for (const imp of inbound.get(target) || []) {
        if (!matchedSet.has(imp)) {
          if (!inboundFiles.has(imp)) inboundFiles.set(imp, []);
          inboundFiles.get(imp).push(target);
        }
      }
    }
    return { ...cap, fileSet: matchedSet, files: matched, inboundImporters: inboundFiles };
  });

  const capOfFile = new Map(); // file -> [capability dispositions]
  for (const cap of capabilities) {
    for (const f of cap.files) {
      if (!capOfFile.has(f)) capOfFile.set(f, []);
      capOfFile.get(f).push(cap.id);
    }
  }

  // 4. closure analysis
  const fileDisposition = (f) => {
    const caps = capOfFile.get(f) || [];
    const capsFull = caps.map((id) => capabilities.find((c) => c.id === id));
    if (capsFull.some((c) => c.disposition === 'DELETE')) return 'DELETE';
    if (capsFull.some((c) => c.disposition === 'INVESTIGATE')) return 'INVESTIGATE';
    if (capsFull.some((c) => c.disposition === 'REWRITE_FOR_ACP')) return 'REWRITE_FOR_ACP';
    if (capsFull.length) return 'KEEP';
    return 'UNCOVERED';
  };

  for (const cap of capabilities) {
    const explained = [];
    const unexplained = [];
    for (const [imp, targets] of cap.inboundImporters) {
      const disp = fileDisposition(imp);
      const isTestOrDoc = /\.(?:test|spec|stories)\.|__tests__|\.mdx?$/.test(imp);
      if (disp === 'DELETE' || disp === 'INVESTIGATE' || isTestOrDoc) {
        explained.push({ importer: imp, disposition: disp, targets });
      } else {
        unexplained.push({ importer: imp, disposition: disp, targets });
      }
    }
    cap.inbound = {
      total: cap.inboundImporters.size,
      explained: explained.length,
      unexplained: unexplained.map((u) => ({
        importer: u.importer,
        disposition: u.disposition,
        targets: u.targets,
      })),
    };
    delete cap.inboundImporters;
    delete cap.fileSet;
    cap.fileCount = cap.files.length;
  }

  // 5. package-level consumer map (workspace deps)
  const packageConsumers = {};
  for (const [name] of pkgByName) {
    const consumers = [...(externalDeps.get(name) || [])];
    packageConsumers[name] = consumers;
  }

  // 6. enumerations
  const nextRoutes = enumerateNextRoutes();
  const spaRoutes = enumerateSpaRoutes();
  const lambdaRouters = enumerateLambdaRouters();
  const dbTables = enumerateDbTables();
  const migrations = countMigrations();
  const locales = enumerateLocales();
  const docs = enumerateDocs();
  const testFiles = files.filter(
    (f) => /\.(?:test|spec)\.[tj]sx?$/.test(f) || f.includes('__tests__/'),
  );
  const storeDirs = files.filter((f) => f.startsWith('src/store/') || /\/store\//.test(f));

  // exact-match exceptions for imports that legitimately cannot resolve
  // statically (dynamic specifiers, generated modules). boundary.json entries:
  // {importer, specifier, reason, owner, expiry} — no wildcards.
  const exceptionSet = new Set(
    (boundary.importExceptions || []).map((e) => `${e.importer} ${e.specifier}`),
  );
  const unresolvedInternal = unresolved.filter(
    (u) => !exceptionSet.has(`${u.importer} ${u.specifier}`),
  );

  const census = {
    generatedAt: new Date().toISOString(),
    baseBranch,
    baseSha,
    counts: {
      sourceFiles: files.length,
      workspacePackages: pkgByName.size,
      nextRoutes: nextRoutes.length,
      spaRouteEntries: spaRoutes.length,
      lambdaRouters: lambdaRouters.length,
      dbTables: dbTables.length,
      migrationDirs: migrations.migrationDirs,
      migrationSqlFiles: migrations.sqlFiles,
      localeFiles: Object.values(locales.localeDirs).reduce((a, b) => a + b, 0),
      defaultNamespaceFiles: locales.defaultNamespaces.length,
      docFiles: docs.length,
      testFiles: testFiles.length,
      storeFiles: storeDirs.length,
      unresolvedImports: unresolved.length,
      unresolvedInternalImports: unresolvedInternal.length,
    },
    enumerations: {
      nextRoutes,
      spaRoutes,
      lambdaRouters,
      dbTables,
      migrations,
      locales,
      docs,
    },
    packageConsumers,
    capabilities: capabilities.map((c) => ({
      id: c.id,
      disposition: c.disposition,
      reason: c.reason,
      issue: c.issue,
      owner: c.owner,
      followUp: c.followUp,
      globs: c.globs,
      fileCount: c.fileCount,
      files: c.files,
      inbound: c.inbound,
    })),
    uncoveredFiles: files.filter((f) => fileDisposition(f) === 'UNCOVERED').sort(),
    uncoveredByArea: {},
    unresolvedImports: unresolved
      .slice()
      .sort(
        (a, b) => a.importer.localeCompare(b.importer) || a.specifier.localeCompare(b.specifier),
      )
      .map((u) => ({
        ...u,
        exempted: exceptionSet.has(`${u.importer} ${u.specifier}`),
      })),
    investigateCapabilities: capabilities
      .filter((c) => c.disposition === 'INVESTIGATE')
      .map((c) => ({ id: c.id, fileCount: c.fileCount, issue: c.issue, owner: c.owner })),
    deleteCapabilitiesWithFiles: capabilities
      .filter((c) => c.disposition === 'DELETE' && c.fileCount > 0)
      .map((c) => ({ id: c.id, fileCount: c.fileCount, issue: c.issue })),
    // Files matched by capabilities whose dispositions disagree — silent
    // precedence (DELETE > INVESTIGATE > REWRITE > KEEP) would hide the
    // conflict, so surface it explicitly and fail `--check` on it.
    // A file is exempt when an overlapAllowance {broad, narrow} in the ledger
    // covers its entire capability set (broad base-layer glob + narrow domain
    // claim); any other cross-disposition overlap is a violation.
    conflictingDispositionFiles: files
      .filter((f) =>
        isDispositionConflict(
          capOfFile.get(f) || [],
          capabilities,
          boundary.overlapAllowances || [],
        ),
      )
      .sort()
      .map((f) => ({
        file: f,
        capabilities: (capOfFile.get(f) || []).sort(),
        dispositions: [
          ...new Set(
            (capOfFile.get(f) || []).map((id) => capabilities.find((c) => c.id === id).disposition),
          ),
        ].sort(),
      })),
  };

  // uncovered distribution by top dir (helps spot ungoverned areas)
  const byArea = {};
  for (const f of census.uncoveredFiles) {
    const area = f.split('/').slice(0, 3).join('/');
    byArea[area] = (byArea[area] || 0) + 1;
  }
  census.uncoveredByArea = Object.fromEntries(Object.entries(byArea).sort((a, b) => b[1] - a[1]));

  // 7. write outputs
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'census.json'), JSON.stringify(census, null, 2));

  const md = renderMarkdown(census, boundary);
  fs.writeFileSync(path.join(OUT_DIR, 'CENSUS.md'), md);

  // 8. check mode — strict, fail-closed on every boundary violation (ORV-116)
  const violations = evaluateCheck(census);
  if (CHECK && violations.length) {
    console.error('slimming boundary violations:');
    for (const v of violations) {
      console.error(`  ${v.rule}: ${v.count}`);
      for (const d of (v.details || []).slice(0, 50)) console.error(`    ${d}`);
      if ((v.details || []).length > 50)
        console.error(`    … +${v.details.length - 50} more (see census.json)`);
    }
    process.exit(1);
  }
  console.log(
    `census: ${files.length} source files, ${pkgByName.size} workspace packages, ${violations.length} boundary violations`,
  );
}

/**
 * Strict boundary evaluation. Pure function over a census-shaped object so the
 * falsifiability tests can inject violations without touching the real tree.
 * Returns a list of {rule, count, details} violations; empty = green.
 */
export function isDispositionConflict(capIds, capabilities, allowances = []) {
  const disps = new Set(capIds.map((id) => capabilities.find((c) => c.id === id).disposition));
  if (disps.size <= 1) return false;
  return !allowances.some(
    (o) => capIds.length > 0 && capIds.every((id) => id === o.broad || id === o.narrow),
  );
}

export function evaluateCheck(census) {
  const v = [];
  if (census.uncoveredFiles.length > 0) {
    v.push({
      rule: 'uncovered source files',
      count: census.uncoveredFiles.length,
      details: census.uncoveredFiles,
    });
  }
  if (census.conflictingDispositionFiles.length > 0) {
    v.push({
      rule: 'conflicting dispositions',
      count: census.conflictingDispositionFiles.length,
      details: census.conflictingDispositionFiles.map(
        (c) => `${c.file}: ${c.capabilities.join(' + ')}`,
      ),
    });
  }
  if (census.investigateCapabilities.length > 0) {
    v.push({
      rule: 'INVESTIGATE capabilities remaining',
      count: census.investigateCapabilities.length,
      details: census.investigateCapabilities.map((c) => `${c.id} (${c.fileCount} files)`),
    });
  }
  if (census.deleteCapabilitiesWithFiles.length > 0) {
    v.push({
      rule: 'DELETE capabilities still matching files',
      count: census.deleteCapabilitiesWithFiles.length,
      details: census.deleteCapabilitiesWithFiles.map((c) => `${c.id} (${c.fileCount} files)`),
    });
  }
  const badCaps = census.capabilities.filter(
    (c) => c.disposition === 'DELETE' && c.inbound.unexplained.length > 0,
  );
  if (badCaps.length) {
    v.push({
      rule: 'DELETE capabilities with unexplained inbound dependencies',
      count: badCaps.length,
      details: badCaps.map((c) => `${c.id}: ${c.inbound.unexplained.length} unexplained importers`),
    });
  }
  const unresolved = (census.unresolvedImports || []).filter((u) => !u.exempted);
  if (unresolved.length > 0) {
    v.push({
      rule: 'unresolved internal imports',
      count: unresolved.length,
      details: unresolved.map((u) => `${u.importer} -> ${u.specifier} (${u.via})`),
    });
  }
  return v;
}

function renderMarkdown(census, boundary) {
  const lines = [
    '# Slimming 01 — capability census + dependency-closure map',
    '',
    `> GENERATED by \`node scripts/slimming/census.mjs\` — do not edit by hand.`,
    `> Base: \`${census.baseBranch}\` @ \`${census.baseSha}\` (${census.generatedAt})`,
    '',
    '## Baseline counts',
    '',
    '| Metric | Count |',
    '| --- | --- |',
  ];
  for (const [k, v] of Object.entries(census.counts)) lines.push(`| ${k} | ${v} |`);
  lines.push(`| uncoveredSourceFiles | ${census.uncoveredFiles.length} |`);
  lines.push('');
  lines.push('## Capability ledger (machine section)');
  lines.push('');
  lines.push(
    '| Capability | Disposition | Files | Inbound external | Unexplained inbound | Issue |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const c of census.capabilities) {
    lines.push(
      `| ${c.id} | ${c.disposition} | ${c.fileCount} | ${c.inbound.total} | ${c.inbound.unexplained.length} | ${c.issue || ''} |`,
    );
  }
  lines.push('');
  lines.push('## DELETE closures — unexplained inbound dependencies');
  lines.push('');
  for (const c of census.capabilities) {
    if (c.disposition !== 'DELETE') continue;
    lines.push(`### ${c.id} (${c.issue || '-'})`);
    lines.push('');
    if (c.inbound.unexplained.length === 0) {
      lines.push('No unexplained inbound dependencies — closure-clean against this tree.');
    } else {
      lines.push('| Importer | Importer disposition | Targets |');
      lines.push('| --- | --- | --- |');
      for (const u of c.inbound.unexplained.slice(0, 200)) {
        lines.push(`| \`${u.importer}\` | ${u.disposition} | ${u.targets.length} file(s) |`);
      }
      if (c.inbound.unexplained.length > 200)
        lines.push(`| … | | +${c.inbound.unexplained.length - 200} more |`);
    }
    lines.push('');
  }
  lines.push('## Conflicting dispositions');
  lines.push('');
  if ((census.conflictingDispositionFiles || []).length === 0) {
    lines.push('None — every file has a single unambiguous disposition.');
  } else {
    lines.push('| File | Capabilities | Dispositions |');
    lines.push('| --- | --- | --- |');
    for (const c of census.conflictingDispositionFiles.slice(0, 200)) {
      lines.push(`| \`${c.file}\` | ${c.capabilities.join(', ')} | ${c.dispositions.join(', ')} |`);
    }
  }
  lines.push('');
  lines.push('## Unresolved internal imports');
  lines.push('');
  const unresolved = census.unresolvedImports || [];
  if (unresolved.length === 0) {
    lines.push('None — every specifier resolves.');
  } else {
    lines.push('| Importer | Specifier | Via | Exempted |');
    lines.push('| --- | --- | --- | --- |');
    for (const u of unresolved.slice(0, 300)) {
      lines.push(
        `| \`${u.importer}\` | \`${u.specifier}\` | ${u.via} | ${u.exempted ? 'yes' : ''} |`,
      );
    }
    if (unresolved.length > 300) lines.push(`| … | | | +${unresolved.length - 300} more |`);
  }
  lines.push('');
  lines.push('## UNCOVERED source files by area (top 40)');
  lines.push('');
  lines.push('| Area | Files |');
  lines.push('| --- | --- |');
  for (const [area, n] of Object.entries(census.uncoveredByArea).slice(0, 40)) {
    lines.push(`| \`${area}\` | ${n} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push(
    'Vocabulary: ' +
      Object.entries(boundary.vocabulary)
        .map(([k, v]) => `**${k}** — ${v}`)
        .join(' '),
  );
  lines.push('');
  return lines.join('\n');
}

// Run as CLI unless imported as a module (the falsifiability tests import
// evaluateCheck without scanning the tree).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main();
}
