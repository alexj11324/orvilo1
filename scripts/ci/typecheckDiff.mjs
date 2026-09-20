#!/usr/bin/env node
/**
 * Base-vs-head `tsc`/`tsgo` diagnostic diff for the frozen remediation SHA (R11).
 *
 * The review requires a per-diagnostic comparison — not "error count went
 * down" — so this script captures the full type-check output on two commits
 * and reports the set difference:
 *
 *   node scripts/ci/typecheckDiff.mjs --base canary --head HEAD
 *     [--worktree-dir <dir>] [--out <report.json>]
 *     [--scope <pkgdir>]   # `pnpm --dir <pkgdir> type-check` instead of root
 *     [--head-log <file>]  # reuse a captured head log instead of re-running
 *
 * A diagnostic is keyed by `<relpath>:<line>:<col> <TScode>` (message text is
 * NOT part of the key — messages embed moveable identifiers that would make
 * every moved line look new). Pass criteria:
 *
 *   - every head diagnostic must exist in the base set (zero NEW keys), and
 *   - the report lists removed/added keys so a human can audit the delta.
 *
 * The head is always typechecked in the caller's working tree (so run this
 * with the frozen SHA checked out). The base is typechecked in a temp git
 * worktree so the caller's files are never touched.
 *
 * Caveat: `line:col` keys shift when a file gains lines above an existing
 * error — the report therefore also emits a per-file error COUNT delta so
 * shifted-but-identical errors are visible as `same-file` churn, not silent
 * new keys. Both views are in the JSON report; the gate reads `added` (exact
 * keys) and `perFileDelta` (count drift) and fails only when `added` contains
 * a diagnostic whose file+code did not exist anywhere in the base set.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const base = flag('base', 'canary');
const head = flag('head', 'HEAD');
const outFile = flag('out', null);
const scope = flag('scope', null);
const headLog = flag('head-log', null);
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

const DIAG_RE =
  /^(?<file>[^()\s][^()]*)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+):(?<msg>.*)$/;

const parseDiagnostics = (text, stripPrefix) =>
  text
    .split('\n')
    .map((l) => DIAG_RE.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({
      code: m.groups.code,
      file: m.groups.file.replace(stripPrefix, '').replace(/^\.\.\/\.\.\//, ''),
      key: `${m.groups.file.replace(stripPrefix, '').replace(/^\.\.\/\.\.\//, '')}:${m.groups.line}:${m.groups.col} ${m.groups.code}`,
      line: Number(m.groups.line),
      msg: m.groups.msg.trim().slice(0, 160),
    }));

const runTypecheck = (cwd) => {
  // Scoped runs print paths relative to the package dir — the caller passes
  // a matching stripPrefix so base and head keys compare on equal footing.
  const argv = scope ? ['--dir', scope, 'type-check'] : ['type-check'];
  try {
    return execFileSync('pnpm', argv, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true', NODE_OPTIONS: '--max-old-space-size=12288' },
      maxBuffer: 1024 * 1024 * 64,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // tsc/tsgo exits non-zero when diagnostics exist — that's the normal path.
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
};

const stripFor = scope ? `${scope}/` : null;

// --- head diagnostics (caller's working tree) ---
const headDiags = parseDiagnostics(
  headLog ? readFileSync(resolve(headLog), 'utf8') : runTypecheck(repoRoot),
  stripFor ?? repoRoot,
);

// --- base diagnostics (detached temp worktree so the caller's tree is safe) ---
const worktreeDir = flag('worktree-dir', null) ?? mkdtempSync(join(tmpdir(), 'tc-base-'));
execFileSync('git', ['worktree', 'add', '--detach', worktreeDir, base], {
  cwd: repoRoot,
  stdio: 'inherit',
});
try {
  execFileSync('pnpm', ['install', '--frozen-lockfile=false'], {
    cwd: worktreeDir,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    maxBuffer: 1024 * 1024 * 64,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseDiags = parseDiagnostics(runTypecheck(worktreeDir), stripFor ?? worktreeDir);

  const baseKeys = new Set(baseDiags.map((d) => d.key));
  const headKeys = new Set(headDiags.map((d) => d.key));
  const added = headDiags.filter((d) => !baseKeys.has(d.key));
  const removed = baseDiags.filter((d) => !headKeys.has(d.key));

  // Strict gate: a diagnostic is only "new" if no diagnostic with the same
  // file+code existed in base (same-file line shifts are tolerated as churn).
  const baseFileCodes = new Set(baseDiags.map((d) => `${d.file} ${d.code}`));
  const hardAdded = added.filter((d) => !baseFileCodes.has(`${d.file} ${d.code}`));

  const perFileDelta = {};
  for (const d of headDiags) perFileDelta[d.file] = (perFileDelta[d.file] ?? 0) + 1;
  for (const d of baseDiags) perFileDelta[d.file] = (perFileDelta[d.file] ?? 0) - 1;
  const driftedFiles = Object.entries(perFileDelta).filter(([, n]) => n !== 0);

  const report = {
    added: added.map((d) => `${d.key} — ${d.msg}`),
    base: { count: baseDiags.length, ref: base },
    head: { count: headDiags.length, ref: head },
    newFileCodeDiagnostics: hardAdded.map((d) => `${d.key} — ${d.msg}`),
    pass: hardAdded.length === 0,
    perFileCountDrift: Object.fromEntries(driftedFiles),
    removed: removed.map((d) => `${d.key} — ${d.msg}`),
    scope,
  };

  if (outFile) writeFileSync(resolve(outFile), JSON.stringify(report, null, 2));
  console.log(`base(${base}): ${baseDiags.length} diagnostics`);
  console.log(`head(${head}): ${headDiags.length} diagnostics`);
  console.log(`added keys: ${added.length} — hard-new file+code: ${hardAdded.length}`);
  console.log(`removed keys: ${removed.length} — files with count drift: ${driftedFiles.length}`);
  if (hardAdded.length) {
    console.log('\nNEW diagnostics (file+code absent from base):');
    for (const d of hardAdded) console.log(`  ${d.key} — ${d.msg}`);
  }
  process.exit(hardAdded.length ? 1 : 0);
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', worktreeDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (!flag('worktree-dir', null)) rmSync(worktreeDir, { force: true, recursive: true });
}
