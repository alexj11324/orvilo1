#!/usr/bin/env node
/**
 * Host/device boundary gate (WD-06, web–desktop convergence plan §8; FIX-E/F08).
 *
 * Checks the real TypeScript module graph — static imports, `export ... from`
 * re-exports, `import()` dynamic imports, `require()`/`require.resolve()`, mock
 * registration calls (`jest.mock`/`vi.mock`), import-equals declarations and
 * `import type`/type-position imports. Specifiers resolve three ways, in order:
 * tsconfig `paths`/aliases via every config in the importer's extends chain
 * (each table against its own base dir), workspace package names through
 * `ts.resolveModuleName` against a virtual node_modules host that exposes each
 * package's real `exports`/`imports` conditions, and relative probes. The real
 * node_modules tree is never walked — workspace packages resolve through the
 * virtual map and everything else classifies as `pkg:`.
 *
 *   shared-to-native   — shared product code (src/features, src/components,
 *                        src/store, src/services … minus declared host
 *                        adapters) must not reach Electron implementations,
 *                        the `electron` package family, exec builtins
 *                        (child_process/fs/process/os and every subpath such as
 *                        fs/promises), or apps/desktop/*.
 *   web-closure        — the web SPA entry closure (entry.web / entry.mobile /
 *                        entry.popup / entry.auth) must not reach the same
 *                        native set. Adapters are legal in the desktop build
 *                        but NOT inside the web closure.
 *   server-cli         — apps/server + apps/cli must not reach apps/desktop or
 *                        Electron app modules.
 *   types-purity       — packages/types + packages/app-config must not import
 *                        ANY node builtin, the electron family, or climb into
 *                        src/ / apps/ (a barrel that pulls side-effectful Node
 *                        code defeats tree-shaking and drags host code into
 *                        every consumer).
 *   unresolved         — an internal RUNTIME specifier (relative, tsconfig
 *                        alias, workspace package or `#` import) on a checked
 *                        path that cannot be resolved fails loudly instead of
 *                        being silently skipped. Type-only specifiers
 *                        (`import type`, `import('x')` in type position) are
 *                        erased by real bundlers, so an unresolvable one is
 *                        recorded as `type-unresolved:` — informational, never
 *                        a violation. Bare third-party specifiers are
 *                        classified `pkg:` without needing node_modules.
 *   isdesktop-census   — `isDesktop` / `__ELECTRON__` in shared src/ is only
 *                        legal in composition roots, host adapters and
 *                        owner-tagged allowlisted files. New violations fail;
 *                        cap regressions fail (shrinking cap).
 *
 * Exemptions live in scripts/ci/hostDeviceBoundariesAllowlist.json (v2): every
 * entry names a PRECISE edge —
 *   {rule, importer, target, scope, owner, issue, reason, exit, expires?}
 * `importer` is a repo-relative path or a precise glob; `target` is the exact
 * resolved target (`builtin:fs`, `builtin:fs/promises`, `pkg:electron`,
 *   `file:apps/desktop/...`, `unresolved:<spec>`). `scope` is `direct` for
 * edges judged on the importer's own source, `closure` for edges judged inside
 * the web entry closure. Census entries use rule `isdesktop-census` with
 * `importer` + `max`. A new importer hitting an already-exempted target FAILS
 * — exemptions own edges, not targets. An allowlisted edge that vanishes is
 * stale and FAILS the run: delete it when you delete the debt.
 *
 * Usage:
 *   node scripts/ci/checkHostDeviceBoundaries.mjs                  # full repo
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --roots <dir>    # fixture tree (tests)
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --no-allowlist   # ignore allowlist
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --allowlist <f>  # explicit allowlist
 *   node scripts/ci/checkHostDeviceBoundaries.mjs --json           # machine-readable
 *
 * Requires the `typescript` package for module resolution and AST extraction.
 * Resolved via HOST_BOUNDARY_TS_PATH or the repo's dev dependency (the CI job
 * installs it into a scratch prefix; fixture runs fall back to a built-in
 * resolver so `node --test` still works without an install).
 */
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DEFAULT_ALLOWLIST = path.join(ROOT, 'scripts/ci/hostDeviceBoundariesAllowlist.json');

const args = process.argv.slice(2);
const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const scanRoot = path.resolve(argValue('--roots') ?? ROOT);
const useRepoMode = scanRoot === ROOT;
const allowlistPath = args.includes('--no-allowlist')
  ? null
  : (argValue('--allowlist') ?? (useRepoMode ? DEFAULT_ALLOWLIST : null));
const jsonOut = args.includes('--json');

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

const SOURCE_DIRS = ['src', 'apps', 'packages'];
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const RESOLVE_EXT = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.d.ts',
];
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
const SKIP_FILE = /\.(?:test|spec|stories)\.[jtcm]sx?$|\.d\.(?:ts|mts|cts|js|mjs|cjs)$/;

/** Exec/native builtins banned from shared code and the web closure. Root match. */
const BANNED_BUILTIN_ROOTS = new Set(['child_process', 'fs', 'os', 'process']);
const BANNED_PACKAGE =
  /^(?:electron|electron-updater|electron-log|electron-store|electron-util|update-electron-app)(?:\/|$)/;
/** Repo-relative prefixes that are native-host implementation. */
const BANNED_PATH = /^apps\/desktop\//;

/** Shared product surface subject to the native-reach ban. */
const SHARED_PREFIX =
  /^src\/(?:features|components|store|services|hooks|utils|libs|layout|locales|providers|routes|business)\//;
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

/** Specifiers that are not code for boundary purposes. */
const ASSET_EXT =
  /\.(?:css|less|s[ac]ss|styl|pcss|svg|png|jpe?g|gif|webp|avif|ico|bmp|cur|woff2?|ttf|otf|eot|mp[34]|webm|mov|mkv|pdf|zip|gz|tar|wasm|map|txt|csv|tsv|xml|html?|md|mdx|ya?ml|toml|ini|env|glsl|vert|frag|sql|graphql|po|pot|l10n|br|zst|bin|dat|sqlite3?|db|pem|crt|key|p12|der|docx?|xlsx?|pptx?|sketch|fig|srt|vtt|ics|vcf|plist|entitlements|icns|ipa|apk|dmg|exe|dll|so|dylib|[ao]|lib|jar|war|class|pyc|whl|gem|php|sh|bash|zsh|fish|ps1|bat|cmd|swift|kt|java|go|rs|[chm]|cc|cpp|cxx|hh|hpp|hxx|mm|cu|lua|hs|ml|fs|vb|cs|vue|svelte|astro|hbs|pug|jade|proto|thrift|capnp|fbs|msgpack|bson|cbor|onnx|pt|ckpt|safetensors|pb|tflite|mlmodel|stl|obj|fbx|gltf|glb|blend|3ds|dxf|dwg|parquet|arrow|avro|ipynb|snap|wav|flac|ogg|aiff|m4a|weba|mpg|mpeg|3gp|flv|wmv|heic|heif|tiff?|jfif|exif|psd|ai|eps|indd|dwf|pbf|geojson|topojson|kml|gpx|ndjson|jsonl|jsonc|json5|hjson|lock|sum|mod|work|tsbuildinfo|patch|diff|jks|keystore|mobileprovision|cer|pfx|p8|gitignore|gitattributes|editorconfig|npmrc|nvmrc|prettierrc|eslintrc|babelrc|browserslistrc)$/;

// ---------------------------------------------------------------------------
// TypeScript engine loading
// ---------------------------------------------------------------------------

const loadTs = () => {
  const req = createRequire(path.join(ROOT, 'package.json'));
  for (const cand of [process.env.HOST_BOUNDARY_TS_PATH, 'typescript'].filter(Boolean)) {
    try {
      const ts = req(cand);
      if (typeof ts?.resolveModuleName === 'function' && typeof ts?.createSourceFile === 'function')
        return ts;
    } catch {
      /* try next */
    }
  }
  return null;
};

const ts = loadTs();
if (!ts && useRepoMode) {
  console.error(
    'FAIL — checkHostDeviceBoundaries requires the `typescript` package for real module\n' +
      'resolution. Install dev dependencies, or point HOST_BOUNDARY_TS_PATH at a\n' +
      'typescript install (the CI job installs it into a scratch prefix).',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Builtin classification — Node's official builtin list, node: prefix + every
// subpath of a builtin normalized onto the builtin root.
// ---------------------------------------------------------------------------

const BARE_BUILTINS = new Set(); // specifiers legal without node: (fs, fs/promises, …)
const NODE_ONLY_BUILTINS = new Set(); // node:-only names (test, sea, …)
for (const m of builtinModules) {
  if (m.startsWith('node:')) NODE_ONLY_BUILTINS.add(m.slice(5));
  else BARE_BUILTINS.add(m);
}

/** Returns the canonical builtin name (no node: prefix, keeps subpath) or null. */
const builtinName = (spec) => {
  if (spec.startsWith('node:')) return spec.slice(5);
  // bare specifier: full name, or root segment for unlisted subpaths (fs/xyz → fs)
  if (BARE_BUILTINS.has(spec)) return spec;
  const root = spec.split('/')[0];
  if (!spec.startsWith('@') && BARE_BUILTINS.has(root) && !NODE_ONLY_BUILTINS.has(spec))
    return spec;
  return null;
};

const pkgRoot = (spec) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

// ---------------------------------------------------------------------------
// Workspace mapping — real package dirs + real package.json exports, exposed to
// TypeScript through a virtual node_modules host so ts.resolveModuleName applies
// each package's actual exports/conditions instead of a guessed src/index.
// ---------------------------------------------------------------------------

/** JSONC parse: a string-aware scan that blanks comments (a `//` inside a
 * string literal like `"https://…"` is NOT a comment) and drops trailing
 * commas outside strings. */
const parseJsonc = (text) => {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += text[++i] ?? '';
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
      i--;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      out += ' ';
      i += 1;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ' ';
      i += 1;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue; // trailing comma
    }
    out += c;
  }
  return JSON.parse(out);
};

const tryRead = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const existsFile = (abs) => {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
};

const existsDir = (abs) => {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
};

/** Expand a pnpm-workspace `packages:` glob into directories holding a package.json. */
const expandWorkspaceGlob = (glob) => {
  const rel = glob.replace(/\/+$/, '');
  if (!rel.includes('*')) return existsDir(path.join(scanRoot, rel)) ? [rel] : [];
  const parts = rel.split('/');
  const out = [];
  const walk = (idx, base) => {
    if (idx === parts.length) {
      if (existsFile(path.join(scanRoot, base, 'package.json'))) out.push(base);
      return;
    }
    const part = parts[idx];
    if (part === '**') {
      // '**' matches zero or more dirs: try staying, then descend everywhere
      walk(idx + 1, base);
      let entries;
      try {
        entries = fs.readdirSync(path.join(scanRoot, base), { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'node_modules') continue;
        walk(idx, `${base}/${ent.name}`);
      }
      return;
    }
    if (part.includes('*')) {
      const re = new RegExp(
        `^${part.replaceAll(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : `\\${c}`))}$`,
      );
      let entries;
      try {
        entries = fs.readdirSync(path.join(scanRoot, base), { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.isDirectory() && re.test(ent.name)) walk(idx + 1, `${base}/${ent.name}`);
      }
      return;
    }
    walk(idx + 1, base ? `${base}/${part}` : part);
  };
  walk(0, '');
  return out;
};

/** name → {dir, pkg} for every workspace package (pnpm-workspace globs, or a
 * fixture fallback of packages/∗ + apps/∗). */
const buildWorkspaceTable = () => {
  const table = new Map();
  let globs = [];
  const yaml = tryRead(path.join(scanRoot, 'pnpm-workspace.yaml'));
  if (yaml) {
    const lines = yaml.split('\n');
    const start = lines.findIndex((l) => /^packages\s*:/.test(l));
    if (start >= 0) {
      for (const l of lines.slice(start + 1)) {
        const m = l.match(/^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/);
        if (m) {
          globs.push(m[1]);
        } else if (l.trim() === '' || l.trim().startsWith('#')) {
          continue; // blank lines/comments inside the list
        } else {
          break; // next yaml key — the packages block is over
        }
      }
    }
  }
  if (!globs.length) globs = ['packages/*', 'apps/*'];
  const dirs = new Set();
  for (const g of globs) for (const d of expandWorkspaceGlob(g)) dirs.add(d);
  for (const dir of dirs) {
    const raw = tryRead(path.join(scanRoot, dir, 'package.json'));
    if (!raw) continue;
    try {
      const pkg = JSON.parse(raw);
      if (pkg.name) table.set(pkg.name, { dir, pkg });
    } catch {
      /* unreadable package.json */
    }
  }
  return table;
};

const workspace = buildWorkspaceTable();

/** Virtual path translation: <scanRoot>/…/node_modules/<name>/<rest> ↔ <dir>/<rest>. */
const NM_SEP = '/node_modules/';
const remapVirtualPath = (p) => {
  const i = p.lastIndexOf(NM_SEP);
  if (i < 0) return p;
  const rest = p.slice(i + NM_SEP.length);
  const segs = rest.split('/');
  for (const n of [2, 1]) {
    const name = segs.slice(0, n).join('/');
    const hit = workspace.get(name);
    if (hit) return path.join(scanRoot, hit.dir, ...segs.slice(n));
  }
  return p;
};
const isVirtualNmContainer = (p) => {
  const norm = p.split(path.sep).join('/');
  if (norm.endsWith('/node_modules')) return norm.startsWith(scanRoot.split(path.sep).join('/'));
  return /\/node_modules\/@[^/]+$/.test(norm);
};

// ---------------------------------------------------------------------------
// Per-importer compiler options — the NEAREST tsconfig.json wins (extends
// chains resolved by TypeScript itself). No tsconfig → bare defaults.
// ---------------------------------------------------------------------------

const tsconfigCache = new Map(); // containingDir → {options, configDir}
const resolutionCache = new Map(); // configKey → ModuleResolutionCache

const findTsconfig = (startDir) => {
  let dir = startDir;
  const stop = path.dirname(scanRoot);
  for (;;) {
    const cand = path.join(dir, 'tsconfig.json');
    if (existsFile(cand)) return cand;
    if (dir === scanRoot || dir === stop || dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }
  return null;
};

const optionsForImporter = (importerAbs) => {
  const containingDir = path.dirname(importerAbs);
  if (tsconfigCache.has(containingDir)) return tsconfigCache.get(containingDir);
  let options;
  const cfg = findTsconfig(containingDir);
  const configDir = cfg ? path.dirname(cfg) : null;
  if (cfg && ts) {
    const read = ts.readConfigFile(cfg, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, configDir);
    options = { ...parsed.options, allowJs: true, resolveJsonModule: true };
  } else {
    options = {
      module: ts ? ts.ModuleKind.ESNext : undefined,
      moduleResolution: ts ? ts.ModuleResolutionKind.Bundler : undefined,
      allowJs: true,
      resolveJsonModule: true,
      checkJs: false,
      jsx: ts ? ts.JsxEmit.ReactJSX : undefined,
    };
  }
  const res = { options, configDir };
  tsconfigCache.set(containingDir, res);
  return res;
};

const resCacheFor = (options) => {
  const key = JSON.stringify({ b: options.baseUrl ?? null, p: options.paths ?? null });
  if (!resolutionCache.has(key)) {
    resolutionCache.set(
      key,
      ts.createModuleResolutionCache(scanRoot, (f) => f, options),
    );
  }
  return resolutionCache.get(key);
};

const NM_PATH_RE = /\/node_modules(?:\/|$)/;
const tsHost = ts
  ? {
      // Paths under *any* node_modules consult ONLY the virtual workspace map —
      // the real node_modules tree (pnpm store symlinks included) is never
      // walked: it is both irrelevant to boundary verdicts and very slow.
      fileExists: (p) => {
        if (!NM_PATH_RE.test(p)) return ts.sys.fileExists(p);
        const v = remapVirtualPath(p);
        return v !== p && ts.sys.fileExists(v);
      },
      readFile: (p) => {
        if (!NM_PATH_RE.test(p)) return ts.sys.readFile(p);
        const v = remapVirtualPath(p);
        return v === p ? undefined : ts.sys.readFile(v);
      },
      directoryExists: (p) => {
        if (NM_PATH_RE.test(p) || /\/node_modules$/.test(p)) {
          const v = remapVirtualPath(p);
          return (v !== p && ts.sys.directoryExists(v)) || isVirtualNmContainer(p);
        }
        return ts.sys.directoryExists(p);
      },
      realpath: (p) => remapVirtualPath(p),
      getCurrentDirectory: () => scanRoot,
      getDirectories: (p) => (NM_PATH_RE.test(p) ? [] : (ts.sys.getDirectories?.(p) ?? [])),
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    }
  : null;

/** Map a resolved absolute path back to a repo-relative target. */
const classifyResolvedPath = (resolvedFileName) => {
  const real = remapVirtualPath(resolvedFileName);
  const rel = path.relative(scanRoot, real).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.includes('node_modules/')) return null;
  return `file:${rel}`;
};

// ---------------------------------------------------------------------------
// Mini resolver — used only when the typescript package is unavailable
// (fixture runs without an install). Mirrors the same semantics: relative →
// tsconfig paths → workspace exports/conditions → pkg:.
// ---------------------------------------------------------------------------

const probeFileInner = (relNoExt) => {
  const abs = path.join(scanRoot, relNoExt);
  if (existsFile(abs)) return relNoExt;
  for (const ext of RESOLVE_EXT) {
    if (existsFile(abs + ext)) return relNoExt + ext;
    if (relNoExt.endsWith(ext) && existsFile(abs)) return relNoExt;
  }
  if (existsDir(abs)) {
    const pkg = tryRead(path.join(abs, 'package.json'));
    if (pkg) {
      try {
        const main = JSON.parse(pkg).exports?.['.'] ?? JSON.parse(pkg).main;
        const target = typeof main === 'string' ? main : null;
        if (target) {
          const hit = probeFile(`${relNoExt}/${target.replace(/^\.\//, '')}`);
          if (hit) return hit;
        }
      } catch {
        /* fall through */
      }
    }
    for (const ext of RESOLVE_EXT) {
      if (existsFile(path.join(abs, `index${ext}`))) return `${relNoExt}/index${ext}`;
    }
  }
  return null;
};

const probeCache = new Map(); // relNoExt → resolved rel path | null
const probeFile = (relNoExt) => {
  if (!probeCache.has(relNoExt)) probeCache.set(relNoExt, probeFileInner(relNoExt));
  return probeCache.get(relNoExt);
};

/** The importer's tsconfig `paths` tables as an ordered CHAIN — the nearest
 * config's own declared table first, then each relative `extends` ancestor's
 * own table, every table resolved against the config file that DECLARED it
 * (an inherited `@/x` mapping keeps its parent's base directory — that's how
 * `{extends: "../../tsconfig.json"}` in apps/server picks up the root's
 * `@/server/*` → `apps/server/src/*` mapping). Union semantics across the
 * chain: a specifier resolvable by ANY config in it resolves. Configs without
 * `paths` contribute nothing; package (`extends: "@scope/base"`) extends are
 * intentionally not followed — none exist in this repo or fixtures. */
const pathsChainCache = new Map(); // containing dir (repo-rel) → [{paths, base}]
const declaredPathsChain = (cfgFile) => {
  const out = [];
  const seen = new Set();
  let cur = cfgFile;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    let raw = {};
    try {
      raw = parseJsonc(tryRead(cur) ?? '{}');
    } catch {
      /* unreadable config contributes nothing */
    }
    const dir = path.dirname(cur);
    const co = raw.compilerOptions ?? {};
    if (co.paths && typeof co.paths === 'object')
      out.push({ paths: co.paths, base: co.baseUrl ? path.resolve(dir, co.baseUrl) : dir });
    cur = null;
    if (typeof raw.extends === 'string' && raw.extends.startsWith('.')) {
      const p = path.resolve(dir, raw.extends);
      cur = existsFile(p) ? p : existsFile(`${p}.json`) ? `${p}.json` : null;
    }
  }
  return out;
};
const pathsContextFor = (importerRel) => {
  const dir = path.posix.dirname(importerRel);
  if (!pathsChainCache.has(dir)) {
    const cfg = findTsconfig(path.join(scanRoot, dir));
    pathsChainCache.set(dir, cfg ? declaredPathsChain(cfg) : []);
  }
  return pathsChainCache.get(dir);
};

/** Apply a tsconfig {paths → [targets]} table to a specifier with TypeScript's
 * own ordering — exact key first, then the wildcard pattern with the longest
 * matching prefix — probing each substitution target in declaration order.
 * Returns {hit, matched}: `matched` distinguishes "no alias covered this
 * specifier" from "the alias matched but the file is missing". */
const applyPathsTable = (spec, paths, pathsBase) => {
  const relBase = path.relative(scanRoot, pathsBase).split(path.sep).join('/');
  const joinTarget = (t) => {
    const rel = path.posix.normalize(path.posix.join(relBase, t.replace(/^\.\//, '')));
    return rel.startsWith('..') ? null : rel;
  };
  const probeTargets = (targets, star) => {
    for (const t of targets) {
      const rel = joinTarget(star === null ? t : t.replaceAll('*', star));
      const hit = rel && probeFile(rel);
      if (hit) return hit;
    }
    return null;
  };
  if (Object.hasOwn(paths, spec)) {
    return { hit: probeTargets(paths[spec], null), matched: true };
  }
  let best = null;
  for (const [idx, pattern] of Object.keys(paths).entries()) {
    if (!pattern.includes('*')) continue;
    const starIdx = pattern.indexOf('*');
    const pre = pattern.slice(0, starIdx);
    const post = pattern.slice(starIdx + 1);
    if (!spec.startsWith(pre) || !spec.endsWith(post)) continue;
    if (spec.length < pre.length + post.length) continue;
    if (!best || pre.length > best.pre.length || (pre.length === best.pre.length && idx < best.idx))
      best = { pattern, pre, post, idx };
  }
  if (!best) return { hit: null, matched: false };
  const star = spec.slice(best.pre.length, spec.length - best.post.length);
  return { hit: probeTargets(paths[best.pattern], star), matched: true };
};

/** Resolve a package.json `exports`/`imports` conditional target (strings,
 * arrays, nulls, nested condition objects, `*` patterns). Prefers source-ish
 * conditions then import/require/default. */
const CONDITIONS = [
  'types',
  'typescript',
  'source',
  'development',
  'browser',
  'import',
  'require',
  'node',
  'default',
];
const resolveConditional = (value, star) => {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [star === null ? value : value.replaceAll('*', star)];
  if (Array.isArray(value)) return value.flatMap((v) => resolveConditional(v, star));
  if (typeof value === 'object') {
    const out = [];
    for (const cond of CONDITIONS) {
      if (cond in value) out.push(...resolveConditional(value[cond], star));
    }
    // keys outside the preference list (custom conditions)
    for (const k of Object.keys(value)) {
      if (!CONDITIONS.includes(k) && !k.startsWith('.'))
        out.push(...resolveConditional(value[k], star));
    }
    return out;
  }
  return [];
};

const resolveWorkspacePackage = (spec) => {
  const name = pkgRoot(spec);
  const hit = workspace.get(name);
  if (!hit) return null;
  const sub = spec === name ? '.' : `.${spec.slice(name.length)}`;
  const candidates = [];
  const { pkg } = hit;
  if (pkg.exports && typeof pkg.exports === 'object') {
    if (sub in pkg.exports) {
      candidates.push(...resolveConditional(pkg.exports[sub], null));
    } else {
      for (const [key, value] of Object.entries(pkg.exports)) {
        if (!key.includes('*')) continue;
        const [pre, post] = key.split('*');
        if (sub.startsWith(pre) && sub.endsWith(post)) {
          const star = sub.slice(pre.length, sub.length - post.length);
          candidates.push(...resolveConditional(value, star));
        }
      }
    }
  } else if (sub === '.') {
    for (const f of ['source', 'module', 'main', 'types']) {
      if (typeof pkg[f] === 'string') candidates.push(pkg[f]);
    }
  }
  for (const cand of candidates) {
    if (typeof cand !== 'string' || cand.startsWith('./') === false) continue;
    const hit2 = probeFile(`${hit.dir}/${cand.slice(2)}`);
    if (hit2) return hit2;
  }
  // package dir itself as a last probe (index.*)
  if (sub === '.') return probeFile(hit.dir);
  return probeFile(`${hit.dir}/${sub.slice(2)}`);
};

/** `#`-specifiers resolve through the `imports` map of the workspace package
 * that contains the importer (Node subpath-imports semantics). */
const resolveHashImport = (importerRel, spec) => {
  for (const info of workspace.values()) {
    if (!(importerRel === info.dir || importerRel.startsWith(`${info.dir}/`))) continue;
    if (!info.pkg.imports) return null;
    const candidates = [];
    if (spec in info.pkg.imports) {
      candidates.push(...resolveConditional(info.pkg.imports[spec], null));
    } else {
      for (const [key, value] of Object.entries(info.pkg.imports)) {
        if (!key.includes('*')) continue;
        const [pre, post] = key.split('*');
        if (spec.startsWith(pre) && spec.endsWith(post))
          candidates.push(
            ...resolveConditional(value, spec.slice(pre.length, spec.length - post.length)),
          );
      }
    }
    for (const t of candidates) {
      if (typeof t !== 'string') continue;
      if (t.startsWith('./')) {
        const hit = probeFile(`${info.dir}/${t.slice(2)}`);
        if (hit) return `file:${hit}`;
      } else {
        return `pkg:${pkgRoot(t)}`; // imports may map to external packages
      }
    }
    return null;
  }
  return null;
};

/** Workspace-name specifiers go through TypeScript's real resolution: the
 * virtual node_modules host maps <root>/node_modules/<name> onto the package
 * dir, so ts.resolveModuleName applies the package's actual exports/conditions.
 * Memoized — a package specifier resolves the same from every importer inside
 * this repo (nested node_modules shadowing is a node_modules-present concern;
 * this gate only needs the file-vs-package verdict). Falls back to the
 * exports-map implementation when the ts package is absent. */
const wsResolutionCache = new Map(); // spec → target | null
const resolveWorkspaceSpec = (importerRel, spec, name) => {
  if (wsResolutionCache.has(spec)) return wsResolutionCache.get(spec);
  let out = null;
  if (ts) {
    const importerAbs = path.join(scanRoot, importerRel);
    const { options } = optionsForImporter(importerAbs);
    const r = ts.resolveModuleName(spec, importerAbs, options, tsHost, resCacheFor(options));
    if (r.resolvedModule)
      out = classifyResolvedPath(r.resolvedModule.resolvedFileName) ?? `pkg:${name}`;
  }
  if (!out) {
    const hit = resolveWorkspacePackage(spec);
    if (hit) out = `file:${hit}`;
  }
  wsResolutionCache.set(spec, out);
  return out;
};

// ---------------------------------------------------------------------------
// Specifier extraction — TypeScript AST when available, regex fallback.
// ---------------------------------------------------------------------------

const stripComments = (source) =>
  source.replaceAll(/\/\*.*?\*\//gs, (m) => ' '.repeat(m.length)).replaceAll(/\/\/[^\n]*/g, '');

// import … from 'x' | export … from 'x' | import 'x' | import('x') | require('x')
const SPEC_RE =
  /(?:^|[\s;{}])(?:from|import|export)[^'"`]*?from\s*['"`]([^'"`\n]+)['"`]|(?:^|[\s;])import\s*['"`]([^'"`\n]+)['"`]|import\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)|require\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/g;

const CALL_SPECIFIERS = new Set([
  'require',
  'require.resolve',
  'jest.mock',
  'jest.unmock',
  'jest.doMock',
  'jest.deepUnmock',
  'vi.mock',
  'vi.unmock',
  'vi.doMock',
  'mock.module',
  'bun.mocks',
]);

const calleeText = (node) => {
  // require | require.resolve | jest.mock | vi.mock | obj.prop
  let cur = node;
  const parts = [];
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) parts.unshift(cur.text);
  else return null;
  return parts.join('.');
};

const extractSpecifiers = (rel, source) => {
  const specs = []; // {spec, kind, typeOnly}
  if (!ts) {
    const clean = stripComments(source);
    for (const m of clean.matchAll(SPEC_RE)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (spec) specs.push({ spec, kind: 'unknown', typeOnly: false });
    }
    return specs;
  }
  const ext = rel.split('.').pop();
  const scriptKind =
    ext === 'tsx'
      ? ts.ScriptKind.TSX
      : ext === 'jsx'
        ? ts.ScriptKind.JSX
        : ext === 'mjs' || ext === 'js'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, scriptKind);
  const push = (spec, kind, typeOnly) => {
    if (typeof spec === 'string' && spec.length) specs.push({ spec, kind, typeOnly });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      push(
        node.moduleSpecifier.text,
        'static',
        Boolean(node.importClause?.isTypeOnly) ||
          node.importClause?.namedBindings?.elements?.every?.((e) => e.isTypeOnly) === true,
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      push(node.moduleSpecifier.text, 'reexport', Boolean(node.isTypeOnly));
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref) && ts.isStringLiteral(ref.expression))
        push(ref.expression.text, 'require', Boolean(node.isTypeOnly));
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) push(arg.text, 'dynamic', false);
        else if (arg) specs.push({ spec: null, kind: 'dynarg', typeOnly: false });
      } else {
        const name = calleeText(node.expression);
        if (name && CALL_SPECIFIERS.has(name)) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteralLike(arg)) push(arg.text, 'require', false);
          else if (arg) specs.push({ spec: null, kind: 'dynarg', typeOnly: false });
        }
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal))
        push(arg.literal.text, 'type-import', true);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
};

// ---------------------------------------------------------------------------
// Specifier → target classification
// ---------------------------------------------------------------------------

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Specifier → target. Fast paths classify the bulk of edges without a single
 * fs probe: builtins and banned packages short-circuit, and bare specifiers
 * that match no tsconfig alias, workspace package or `imports` map are
 * third-party deps (`pkg:`) — node_modules is never needed for that verdict.
 * Internal candidates (relative, alias, `#`, workspace names) resolve through
 * real resolution — tsconfig paths ordering, package exports/conditions — and
 * anything they cannot land becomes `unresolved:` instead of a silent skip.
 */
const resolveSpecifier = (importerRel, spec) => {
  // builtins — node: prefix and every subpath of a builtin
  const bn = spec.startsWith('node:') ? spec.slice(5) : builtinName(spec);
  if (bn !== null) return `builtin:${bn}`;

  if (SCHEME_RE.test(spec)) return `external:${spec}`; // data:, http:, virtual:, blob:, …

  // query/hash suffixes — a code extension keeps resolving as code
  if (/[?#]/.test(spec)) {
    const base = spec.split(/[?#]/)[0];
    if (!SOURCE_EXT.test(base) && !base.endsWith('/')) return `asset:${spec}`;
    spec = base;
  }
  if (ASSET_EXT.test(spec)) return `asset:${spec}`;

  // banned packages short-circuit — never resolve electron into node_modules
  if (BANNED_PACKAGE.test(spec)) return `pkg:${pkgRoot(spec)}`;

  // relative specifiers
  if (spec.startsWith('.')) {
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
    if (joined === '..' || joined.startsWith('../')) return `external:${spec}`;
    const hit = probeFile(joined);
    return hit ? `file:${hit}` : `unresolved:${spec}`;
  }

  // tsconfig paths / aliases — every config in the extends chain, each table
  // applied against the directory of the config that declared it.
  let sawMatch = false;
  for (const { paths, base } of pathsContextFor(importerRel)) {
    const { hit, matched } = applyPathsTable(spec, paths, base);
    if (hit) return `file:${hit}`;
    sawMatch ||= matched;
  }
  if (sawMatch || spec.startsWith('@/') || spec.startsWith('~/')) return `unresolved:${spec}`;

  // package.json `imports` (#-specifiers)
  if (spec.startsWith('#')) return resolveHashImport(importerRel, spec) ?? `unresolved:${spec}`;

  // workspace packages — ts.resolveModuleName through the real exports map
  const name = pkgRoot(spec);
  if (workspace.has(name))
    return resolveWorkspaceSpec(importerRel, spec, name) ?? `unresolved:${spec}`;

  return `pkg:${name}`; // third-party dep — classification needs no node_modules
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
  /** file → [{target, spec, kind, typeOnly}] */
  const graph = new Map();
  const dynargFiles = new Set();
  for (const abs of files) {
    const rel = path.relative(scanRoot, abs).split(path.sep).join('/');
    let source;
    try {
      source = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const edges = [];
    const seen = new Set();
    for (const { spec, kind, typeOnly } of extractSpecifiers(rel, source)) {
      if (kind === 'dynarg') {
        dynargFiles.add(rel);
        continue;
      }
      let target = resolveSpecifier(rel, spec);
      // Type-only specifiers are erased by real bundlers — an unresolvable one
      // is a dangling type annotation, not a graph edge that fails loudly.
      if (typeOnly && target.startsWith('unresolved:')) target = `type-unresolved:${spec}`;
      const key = `${target}|${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ target, spec, kind, typeOnly });
    }
    graph.set(rel, edges);
  }
  return { graph, dynargFiles };
};

// ---------------------------------------------------------------------------
// Reachability predicates
// ---------------------------------------------------------------------------

/** Native-host implementation — illegal from shared code AND server/cli. */
const isNativeImpl = (target) => {
  if (target.startsWith('pkg:')) return BANNED_PACKAGE.test(target.slice(4) + '/');
  if (target.startsWith('file:')) return BANNED_PATH.test(target.slice(5));
  return false;
};

/** Exec builtin (child_process/fs/os/process + every subpath). */
const isExecBuiltin = (target) => {
  if (!target.startsWith('builtin:')) return false;
  return BANNED_BUILTIN_ROOTS.has(target.slice(8).split('/')[0]);
};

const isNativeOrExec = (target) => isNativeImpl(target) || isExecBuiltin(target);

/** Forward-BFS from entry points; returns banned edges `file -> target`. */
const closureBanned = (graph, entries, seedPredicate) => {
  const seen = new Set();
  const banned = [];
  const queue = entries.filter((e) => graph.has(e));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const e of graph.get(file) ?? []) {
      if (seedPredicate(e.target)) banned.push({ file, target: e.target });
      if (e.target.startsWith('file:') && !seen.has(e.target.slice(5)))
        queue.push(e.target.slice(5));
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
  const abs = path.join(scanRoot, 'src');
  if (!fs.existsSync(abs)) return hits;
  for (const f of collectFiles(abs)) {
    const rel = path.relative(scanRoot, f).split(path.sep).join('/');
    const n = (stripComments(fs.readFileSync(f, 'utf8')).match(IS_DESKTOP_RE) ?? []).length;
    if (n > 0) hits.set(rel, n);
  }
  return hits;
};

// ---------------------------------------------------------------------------
// Allowlist v2 — precise edges
// ---------------------------------------------------------------------------

const RULE_SCOPES = {
  'shared-to-native': 'direct',
  'server-cli': 'direct',
  'types-purity': 'direct',
  'unresolved': 'direct',
  'isdesktop-census': 'direct',
  'web-closure': 'closure',
};

const globToRe = (glob) =>
  new RegExp(
    `^${glob
      .split(/(\*\*|\*|\?)/)
      .map((p) =>
        p === '**'
          ? '.*'
          : p === '*'
            ? '[^/]*'
            : p === '?'
              ? '[^/]'
              : p.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('')}$`,
  );

const loadAllowlist = () => {
  if (!allowlistPath) return { edges: [] };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  } catch (e) {
    console.error(`FAIL — allowlist ${allowlistPath} unreadable: ${e.message}`);
    process.exit(1);
  }
  if (raw.files && !raw.edges) {
    console.error(
      'FAIL — allowlist is in the retired v1 `files` format. Migrate to v2 precise\n' +
        'edges: [{rule, importer, target, scope, owner, issue, reason, exit, expires?}].',
    );
    process.exit(1);
  }
  const edges = raw.edges ?? [];
  const errors = [];
  for (const [i, e] of edges.entries()) {
    const where = `entry #${i} (${e.importer ?? '?'})`;
    if (typeof e.rule !== 'string' || !(e.rule in RULE_SCOPES))
      errors.push(`${where}: missing/unknown rule`);
    else if (e.scope !== RULE_SCOPES[e.rule])
      errors.push(`${where}: rule '${e.rule}' requires scope '${RULE_SCOPES[e.rule]}'`);
    if (typeof e.importer !== 'string' || !e.importer) errors.push(`${where}: missing importer`);
    if (e.rule === 'isdesktop-census') {
      if (typeof e.max !== 'number' || e.max < 0) errors.push(`${where}: census requires max ≥ 0`);
    } else if (typeof e.target !== 'string' || !e.target) errors.push(`${where}: missing target`);
    if (typeof e.owner !== 'string' || !e.owner) errors.push(`${where}: missing owner`);
    if (e.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.expires))
      errors.push(`${where}: expires must be YYYY-MM-DD`);
    if (typeof e.importer === 'string' && e.importer.includes('*')) e._re = globToRe(e.importer);
    e._i = i;
  }
  if (errors.length) {
    console.error(`FAIL — invalid allowlist entries:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  return { edges };
};

const today = new Date().toISOString().slice(0, 10);
const expired = (e) => e.expires !== undefined && e.expires < today;
const importerMatches = (e, file) => (e._re ? e._re.test(file) : e.importer === file);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  const { graph, dynargFiles } = buildGraph();
  const { edges: allowEdges } = loadAllowlist();
  const usedAllow = new Set();
  const violations = []; // {rule, file, target, msg}
  const push = (rule, file, target, extra = '') =>
    violations.push({ rule, file, target, msg: `${rule}: ${file} imports ${target}${extra}` });

  const exempt = (rule, file, target) => {
    const i = allowEdges.findIndex(
      (e) =>
        e.rule === rule &&
        e.scope === RULE_SCOPES[rule] &&
        importerMatches(e, file) &&
        (rule === 'isdesktop-census' ? true : e.target === target),
    );
    if (i < 0) return false;
    usedAllow.add(i);
    return !expired(allowEdges[i]);
  };

  // shared-to-native + server-cli + types-purity + unresolved — direct edges.
  for (const [file, edges] of graph) {
    if (ADAPTER_PATH.test(file) || BANNED_PATH.test(file)) continue;
    const shared = SHARED_PREFIX.test(file);
    const serverCli = SERVER_CLI_PREFIX.test(file);
    const pure = PURE_PACKAGES_PREFIX.test(file);
    const checked = shared || serverCli || pure;
    for (const e of edges) {
      if (shared && isNativeOrExec(e.target)) push('shared-to-native', file, e.target);
      if (serverCli && isNativeImpl(e.target)) push('server-cli', file, e.target);
      if (pure) {
        const badBuiltin = e.target.startsWith('builtin:');
        const badPkg = e.target.startsWith('pkg:') && BANNED_PACKAGE.test(e.target.slice(4) + '/');
        const climb =
          e.target.startsWith('file:') &&
          (/^src\//.test(e.target.slice(5)) || /^apps\//.test(e.target.slice(5)));
        if (badBuiltin || badPkg || climb) push('types-purity', file, e.target);
      }
      if (checked && e.target.startsWith('unresolved:'))
        push('unresolved', file, e.target, ` (specifier '${e.spec}')`);
    }
  }

  // web-closure — banned edges reachable from the web entries.
  for (const { file, target } of closureBanned(graph, WEB_ENTRIES, isNativeOrExec)) {
    push('web-closure', file, target);
  }

  // isdesktop-census.
  const hits = census();
  let censusTotal = 0;
  for (const [file, n] of hits) {
    censusTotal += n;
    if (CENSUS_ALLOWED.test(file)) continue;
    const i = allowEdges.findIndex(
      (e) => e.rule === 'isdesktop-census' && importerMatches(e, file),
    );
    if (i >= 0) {
      usedAllow.add(i);
      const e = allowEdges[i];
      if (expired(e) || n > e.max) {
        violations.push({
          rule: 'isdesktop-census',
          file,
          target: `cap:${e.max}`,
          msg: `isdesktop-census: ${file} has ${n} isDesktop/__ELECTRON__ usages, allowlist cap ${e.max}${expired(e) ? ' (entry expired)' : ''}`,
        });
      }
      continue;
    }
    violations.push({
      rule: 'isdesktop-census',
      file,
      target: `count:${n}`,
      msg: `isdesktop-census: ${file} uses isDesktop/__ELECTRON__ (${n}x) outside adapter roots`,
    });
  }

  // Exemptions: apply to non-census violations (census handled above).
  const remaining = violations.filter((v) => {
    if (v.rule === 'isdesktop-census') return true;
    return !exempt(v.rule, v.file, v.target);
  });

  // Stale entries — an allowlisted edge that no longer exists fails the run:
  // delete the entry when you delete the debt.
  const stale = allowEdges.filter((e) => !usedAllow.has(e._i));
  const expiredEntries = allowEdges.filter((e) => expired(e));

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          scanned: graph.size,
          census: { files: hits.size, usages: censusTotal },
          violations: remaining.map(({ rule, file, target, msg }) => ({ rule, file, target, msg })),
          stale: stale.map((e) => `${e.importer} → ${e.target ?? e.max}`),
          expired: expiredEntries.map((e) => e.importer),
          dynarg: [...dynargFiles],
        },
        null,
        1,
      ),
    );
    process.exit(remaining.length || stale.length ? 1 : 0);
  }

  console.log(
    `host/device boundary gate — ${graph.size} files scanned under ${useRepoMode ? 'repo' : scanRoot}` +
      `${ts ? ' (ts.resolveModuleName)' : ' (built-in resolver)'}`,
  );
  console.log(
    `isDesktop/__ELECTRON__ census: ${censusTotal} usages in ${hits.size} files (shared src/)`,
  );
  if (dynargFiles.size)
    console.log(
      `non-literal dynamic specifiers (informational): ${dynargFiles.size} file(s)\n  ${[...dynargFiles].slice(0, 20).join('\n  ')}${dynargFiles.size > 20 ? `\n  … +${dynargFiles.size - 20} more` : ''}`,
    );
  if (expiredEntries.length)
    console.log(
      `expired allowlist entries (inert — debt resurfaces):\n  ${expiredEntries.map((e) => `${e.importer} → ${e.target ?? `max ${e.max}`}`).join('\n  ')}`,
    );
  if (stale.length) {
    console.error(
      `\nFAIL — ${stale.length} stale allowlist entrie(s) — the exempted edge no longer\n` +
        `exists; delete the entry together with the debt:\n  ${stale
          .map((e) => `${e.importer} → ${e.target ?? `max ${e.max}`} (${e.rule})`)
          .join('\n  ')}`,
    );
  }
  if (remaining.length) {
    console.error(
      `${stale.length ? '\n' : ''}FAIL — ${remaining.length} boundary violation(s):\n  ${remaining.map((v) => v.msg).join('\n  ')}`,
    );
  }
  if (remaining.length || stale.length) process.exit(1);
  console.log('PASS — no boundary violations');
};

main();
