#!/usr/bin/env node
/**
 * Base-vs-head `tsc`/`tsgo` diagnostic diff for the frozen remediation SHA (R11).
 *
 * The review requires a per-diagnostic comparison — not "error count went
 * down" and not "same file+code existed before" — so this script captures the
 * full type-check output on two commits and multiset-matches diagnostics by
 * `<file>|<TScode>|<normalized message>` (line/col deliberately excluded: a
 * diagnostic that merely shifted lines still matches, but any *new*
 * diagnostic — same file, same code, new or moved count — is a hard failure).
 *
 *   node scripts/ci/typecheckDiff.mjs --base canary --head HEAD
 *     [--scope <pkgdir>]        # `pnpm --dir <pkgdir> type-check`
 *     [--head-log <file> --head-sha <sha>]  # reuse a captured head log
 *     [--waiver-file <json>]    # explicit per-diagnostic waivers (see below)
 *     [--worktree-dir <dir>] [--out <report.json>]
 *
 * Hard-fail conditions (never a silent green):
 *   - typecheck process fails to spawn, is signalled, OOMs, or exits with a
 *     non-diagnostic status (tsc uses 1 for diagnostics, 2 for config errors);
 *   - zero diagnostics parsed on a non-zero exit (crash mid-run looks like
 *     "clean" otherwise);
 *   - any head diagnostic has no unmatched base counterpart in its
 *     file+code+message bucket (including count increases — CE-01);
 *   - --head-log without --head-sha, or a --head-sha that does not match the
 *     log's embedded `# tc-head-sha` marker when present (J05).
 *
 * Waivers: a JSON array of {file, code, msg, reason, expires} entries. Each
 * unmatched head diagnostic consumes exactly one matching waiver (prefix match
 * on msg); an expired or absent waiver leaves the diagnostic failing.
 *
 * The head is typechecked in the caller's working tree; the base is
 * typechecked in a detached temp worktree after `pnpm install` (frozen when a
 * lockfile exists; the repo currently ships none, so resolved versions and the
 * env summary are recorded in the report for auditability).
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const fail = (why) => {
  console.error(`typecheckDiff BLOCKED: ${why}`);
  process.exit(2);
};

const base = flag('base', 'canary');
const head = flag('head', 'HEAD');
const outFile = flag('out', null);
const scope = flag('scope', null);
const headLog = flag('head-log', null);
const headShaArg = flag('head-sha', null);
const waiverFile = flag('waiver-file', null);
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

// File paths may contain parens (Next.js route groups, e.g. `app/(main)/x.ts`),
// so the matcher is a lazy file part + strict `(<line>,<col>): error TS####:`.
const DIAG_RE = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+):(?<msg>.*)$/;

const parseDiagnostics = (text, stripPrefix, msgRoots) =>
  text
    .split('\n')
    .map((l) => DIAG_RE.exec(l.trim()))
    .filter(Boolean)
    .map((m) => {
      const file = m.groups.file
        .replace(stripPrefix, '')
        .replace(/^\.\.\/\.\.\//, '')
        .replace(/^\.\//, '');
      // tsc embeds absolute paths in some messages (import("/abs/...") module
      // names, node_modules resolution paths). Base runs in a temp worktree,
      // so identical diagnostics would never bucket-match without stripping
      // each side's checkout root to a shared placeholder. macOS resolves
      // /tmp → /private/tmp inside spawned processes, so both the given root
      // and its realpath must normalize. Longest first — /tmp/x is a substring
      // of /private/tmp/x, so a plain root must never preempt its realpath.
      let msg = m.groups.msg.trim().slice(0, 300);
      for (const root of [...msgRoots].sort((a, b) => b.length - a.length))
        msg = msg.replaceAll(root, '<root>');
      return {
        code: m.groups.code,
        col: Number(m.groups.col),
        file,
        line: Number(m.groups.line),
        msg,
        // Multiset bucket: identical (file, code, msg) entries match across
        // line shifts; count drift inside a bucket is therefore a real new
        // diagnostic, not churn.
        bucket: `${file}|${m.groups.code}|${msg}`,
        key: `${file}:${m.groups.line}:${m.groups.col} ${m.groups.code}`,
      };
    });

const runTypecheck = (cwd) => {
  const argv = scope ? ['--dir', scope, 'type-check'] : ['type-check'];
  const res = spawnSync('pnpm', argv, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      NODE_OPTIONS: '--max-old-space-size=12288',
    },
    maxBuffer: 1024 * 1024 * 64,
  });
  if (res.error) fail(`typecheck process failed to spawn: ${res.error.message}`);
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const status = res.status;
  // tsc: 0 clean / 1 diagnostics / 2 config error. Anything else or a signal
  // means the run did not complete normally — refuse to treat it as evidence.
  if (res.signal)
    fail(
      `typecheck killed by signal ${res.signal} (possible OOM/crash) — output tail:\n${out.slice(-2000)}`,
    );
  if (status !== 0 && status !== 1 && status !== 2)
    fail(`typecheck exited ${status} — not a normal diagnostics exit`);
  const diags = parseDiagnostics(out, null, [cwd, realpathSync(cwd)]).length;
  if (status !== 0 && diags === 0)
    fail(
      `typecheck exited ${status} with zero parseable diagnostics — run did not produce evidence`,
    );
  return { out, status };
};

const envSummary = () => ({
  node: execSync('node --version', { encoding: 'utf8' }).trim(),
  pnpm: execSync('pnpm --version', { encoding: 'utf8' }).trim(),
});

// --- head diagnostics (caller's working tree or a captured log) ---
let headDiags;
let headSha;
if (headLog) {
  if (!headShaArg)
    fail('--head-log requires --head-sha <sha> naming the commit the log was produced on');
  const text = readFileSync(resolve(headLog), 'utf8');
  const marker = /^# tc-head-sha (?<sha>[0-9a-f]{40})/m.exec(text);
  if (marker && marker.groups.sha !== headShaArg)
    fail(`--head-sha ${headShaArg} does not match log marker ${marker.groups.sha}`);
  headDiags = parseDiagnostics(text, scope ? `${scope}/` : repoRoot, [
    repoRoot,
    realpathSync(repoRoot),
  ]);
  headSha = headShaArg;
} else {
  headSha = execSync(`git rev-parse ${head}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
  headDiags = parseDiagnostics(runTypecheck(repoRoot).out, scope ? `${scope}/` : repoRoot, [
    repoRoot,
    realpathSync(repoRoot),
  ]);
}

// --- base diagnostics (detached temp worktree so the caller's tree is safe) ---
const worktreeDir = flag('worktree-dir', null) ?? mkdtempSync(join(tmpdir(), 'tc-base-'));
execFileSync('git', ['worktree', 'add', '--detach', worktreeDir, base], {
  cwd: repoRoot,
  stdio: 'inherit',
});
try {
  const lockfile = join(worktreeDir, 'pnpm-lock.yaml');
  const installArgs = existsSync(lockfile) ? ['install', '--frozen-lockfile'] : ['install'];
  const install = spawnSync('pnpm', installArgs, {
    cwd: worktreeDir,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    maxBuffer: 1024 * 1024 * 64,
  });
  if (install.status !== 0 || install.error)
    fail(
      `base pnpm install failed (status=${install.status}, err=${install.error?.message ?? 'none'})`,
    );
  const baseSha = execSync('git rev-parse HEAD', {
    cwd: worktreeDir,
    encoding: 'utf8',
  }).trim();
  const baseDiags = parseDiagnostics(
    runTypecheck(worktreeDir).out,
    scope ? `${scope}/` : worktreeDir,
    [worktreeDir, realpathSync(worktreeDir)],
  );

  // Multiset match: every head diagnostic consumes one base bucket entry.
  const buckets = new Map();
  for (const d of baseDiags) {
    const n = buckets.get(d.bucket) ?? 0;
    buckets.set(d.bucket, n + 1);
  }
  const unmatched = [];
  for (const d of headDiags) {
    const n = buckets.get(d.bucket) ?? 0;
    if (n > 0) buckets.set(d.bucket, n - 1);
    else unmatched.push(d);
  }
  const removed = [];
  for (const d of baseDiags) {
    const n = buckets.get(d.bucket) ?? 0;
    if (n > 0) {
      buckets.set(d.bucket, n - 1);
      removed.push(d);
    }
  }

  const waivers = waiverFile ? JSON.parse(readFileSync(resolve(waiverFile), 'utf8')) : [];
  const now = Date.now();
  const unwaived = [];
  const usedWaivers = [];
  for (const d of unmatched) {
    const i = waivers.findIndex(
      (w) =>
        w.file === d.file &&
        w.code === d.code &&
        (d.msg === w.msg || d.msg.startsWith(w.msg)) &&
        (!w.expires || Date.parse(w.expires) > now),
    );
    if (i === -1) unwaived.push(d);
    else {
      usedWaivers.push({ diag: `${d.key} — ${d.msg}`, waiver: waivers[i] });
      waivers.splice(i, 1);
    }
  }

  const baseKeys = new Set(baseDiags.map((d) => d.key));
  const headKeys = new Set(headDiags.map((d) => d.key));
  const exactAdded = headDiags.filter((d) => !baseKeys.has(d.key));

  const report = {
    base: { count: baseDiags.length, ref: base, sha: baseSha },
    env: envSummary(),
    exactKeyChurn: {
      added: exactAdded.map((d) => `${d.key} — ${d.msg}`),
      removed: baseDiags.filter((d) => !headKeys.has(d.key)).map((d) => `${d.key} — ${d.msg}`),
    },
    head: { count: headDiags.length, ref: head, sha: headSha },
    newDiagnostics: unwaived.map((d) => `${d.key} — ${d.msg}`),
    pass: unwaived.length === 0,
    removed: removed.map((d) => `${d.key} — ${d.msg}`),
    scope,
    waived: usedWaivers,
  };

  if (outFile) writeFileSync(resolve(outFile), JSON.stringify(report, null, 2));
  console.log(`base(${base}@${baseSha.slice(0, 8)}): ${baseDiags.length} diagnostics`);
  console.log(`head(${head}@${headSha.slice(0, 8)}): ${headDiags.length} diagnostics`);
  console.log(
    `unmatched head diagnostics: ${unmatched.length} — waived: ${usedWaivers.length} — hard-new: ${unwaived.length}`,
  );
  console.log(`removed: ${removed.length}`);
  if (unwaived.length) {
    console.log('\nNEW diagnostics (no base file+code+message counterpart):');
    for (const d of unwaived) console.log(`  ${d.key} — ${d.msg}`);
    process.exit(1);
  }
  process.exit(0);
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', worktreeDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (!flag('worktree-dir', null)) rmSync(worktreeDir, { force: true, recursive: true });
}
