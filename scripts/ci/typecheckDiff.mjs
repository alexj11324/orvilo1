#!/usr/bin/env node
/**
 * Base-vs-head `tsc`/`tsgo` diagnostic diff for the frozen remediation SHA (R11).
 *
 * The review requires a per-diagnostic comparison — not "error count went
 * down" and not "same file+code existed before" — so this script captures the
 * full type-check output on two commits and multiset-matches diagnostics by
 * `<file>|<TScode>|<full multi-line normalized message>` (line/col
 * deliberately excluded: a diagnostic that merely shifted lines still
 * matches, but any *new* diagnostic — same file, same code, new or moved
 * count — is a hard failure). Messages are NOT truncated: two diagnostics
 * that differ only at character 301 or on a continuation line do not cancel
 * each other out (CE-07).
 *
 *   node scripts/ci/typecheckDiff.mjs --base canary --head HEAD
 *     [--scope <pkgdir>]        # `pnpm --dir <pkgdir> type-check`
 *     [--head-log <file> --head-sha <sha>]  # reuse a captured head log
 *     [--capture <file>]        # capture this run's head log with envelope
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
 *   - a live `--head` run whose resolved SHA does not match the actual
 *     checkout, whose tree changes during the run, or a dirty working tree —
 *     the report must correspond to the tree it claims to measure;
 *   - `--head-log` whose envelope is missing/incomplete, whose sha/scope/
 *     dirty state is wrong, whose `tc-tree-sha` is not the 40-hex git tree of
 *     `--head-sha`, whose exit/signal/completion fields do not prove a
 *     completed run, whose dependency fingerprint differs from the current
 *     environment, or whose payload hash does not match the raw log bytes;
 *   - a run (live or replayed) that exits non-zero with zero parseable
 *     diagnostics, or whose output contains any error-category line the
 *     parser does not recognize — an unknown category is blocked, never
 *     silently dropped as runner noise (global `error TS####:` lines
 *     without a file position ARE parsed as `<global>` diagnostics).
 *
 * Head-log envelope (`--capture` emits it; `--head-log` requires it):
 *   # tc-envelope 1
 *   # tc-head-sha <40-hex>          — commit the log ran on
 *   # tc-tree-sha <40-hex>          — HEAD^{tree} at capture time
 *   # tc-dirty 0|1                  — working tree clean at capture time
 *   # tc-dirty-sha256 <64-hex>      — sha256 of `git diff HEAD` (dirty only)
 *   # tc-exit <int>                 — typecheck process exit status
 *   # tc-signal <name|none>         — terminating signal, 'none' if exited
 *   # tc-completed 1                — process ran to a normal diagnostics exit
 *   # tc-scope <scope|->            # the --scope the log covered
 *   # tc-env-sha256 <64-hex>        — fingerprint: node+pnpm+compiler
 *                                     versions+lockfile+tsconfig extends chain
 *   # tc-log-sha256 <64-hex>        — sha256 of the raw output after the marker
 *   --- tc-output ---
 *   <raw tsc/tsgo output>
 *
 * Waivers: a JSON array of {file, code, msg, reason, expires} entries — every
 * field mandatory, `reason` a non-empty human justification and `expires` an
 * unexpired ISO date. Each unmatched head diagnostic consumes exactly one
 * matching waiver (msg prefix match against the full, untruncated message).
 *
 * The head is typechecked in the caller's working tree (or replayed from a
 * captured log); the base is typechecked in a detached temp worktree after
 * `pnpm install` (frozen when a lockfile exists).
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// File paths may contain parens (Next.js route groups, e.g. `app/(main)/x.ts`),
// so the matcher is a lazy file part + strict `(<line>,<col>): error TS####:`.
const DIAG_RE = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+):(?<msg>.*)$/;
// Global (file-less) compiler diagnostics — `error TS5083: Cannot read file
// 'tsconfig.json'.` — carry no position. Dropping them would turn a broken
// configuration into "zero evidence", so they parse as `<global>`
// diagnostics and participate in the multiset diff like any other.
const GLOBAL_DIAG_RE = /^error (?<code>TS\d+):(?<msg>.*)$/;
// Alternate located spelling used by pretty/colon-format emitters:
// `src/a.ts:1:2 - error TS2304: msg`.
const ALT_DIAG_RE = /^(?<file>.+?):(?<line>\d+):(?<col>\d+)\s*-\s*error (?<code>TS\d+):(?<msg>.*)$/;
// tsc epilogue lines are tooling noise, not diagnostic detail — never let them
// extend the previous diagnostic's message.
const EPILOGUE_RE = /^(?:Found \d+ errors?|Errors {2}Files|Total time|Watching for file changes)/;

/**
 * Parse `tsc`/`tsgo` output into diagnostics. Multi-line messages are joined:
 * tsc indents message continuations, so only indented lines following a
 * diagnostic extend its message. Any unindented non-diagnostic line (epilogue
 * noise, package-manager chatter like `Scope:`/`[WARN]`/`[ELIFECYCLE]` lines
 * after the last diagnostic) terminates the current diagnostic instead of
 * contaminating its bucket.
 */
export const parseDiagnostics = (text, stripPrefix, msgRoots) => {
  const diags = [];
  let current = null;
  const roots = [...msgRoots].sort((a, b) => b.length - a.length);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const m = DIAG_RE.exec(line) ?? ALT_DIAG_RE.exec(line);
    const g = m ? null : GLOBAL_DIAG_RE.exec(line);
    if (m || g) {
      if (current) diags.push(current);
      const groups = m ? m.groups : g.groups;
      const file = g
        ? '<global>'
        : groups.file
            .replace(stripPrefix ?? '', '')
            .replace(/^\.\.\/\.\.\//, '')
            .replace(/^\.\//, '');
      // tsc embeds absolute paths in some messages (import("/abs/...") module
      // names, node_modules resolution paths). Base runs in a temp worktree,
      // so identical diagnostics would never bucket-match without stripping
      // each side's checkout root to a shared placeholder. macOS resolves
      // /tmp → /private/tmp inside spawned processes, so both the given root
      // and its realpath must normalize. Longest first — /tmp/x is a substring
      // of /private/tmp/x, so a plain root must never preempt its realpath.
      let msg = groups.msg.trim();
      for (const root of roots) msg = msg.replaceAll(root, '<root>');
      current = {
        code: groups.code,
        col: g ? 0 : Number(groups.col),
        file,
        line: g ? 0 : Number(groups.line),
        msgLines: [msg],
      };
    } else if (current && line && !EPILOGUE_RE.test(line) && /^\s/.test(rawLine)) {
      let cont = line;
      for (const root of roots) cont = cont.replaceAll(root, '<root>');
      current.msgLines.push(cont);
    } else if (current && (EPILOGUE_RE.test(line) || (line && !/^\s/.test(rawLine)))) {
      diags.push(current);
      current = null;
    }
  }
  if (current) diags.push(current);
  return diags.map(({ msgLines, ...d }) => {
    const msg = msgLines.join('\n');
    return {
      ...d,
      msg,
      // Multiset bucket: identical (file, code, msg) entries match across
      // line shifts; count drift inside a bucket is therefore a real new
      // diagnostic, not churn.
      bucket: `${d.file}|${d.code}|${msg}`,
      key: `${d.file}:${d.line}:${d.col} ${d.code}`,
    };
  });
};

/**
 * Unindented lines that look like error/warning output but match no
 * recognized diagnostic shape — a non-`TS` code (`x.ts(1,1): error ESLint9:`),
 * a `warning` kind, a codeless `error:` line, or a malformed `error TS...`
 * without the colon. tsc's own diagnostics always carry a `TS####` code, so
 * anything else is an unknown category: callers must block instead of
 * silently diffing a partial parse. Runner chatter stays untouched because
 * it is never lowercase compiler-led (`Scope:`, `ERROR Command failed`,
 * `ERR_PNPM_*`, `npm ERR!`, `[WARN]`, `ELIFECYCLE` are all uppercase or
 * bracketed).
 */
export const collectUnknownErrorLines = (text) => {
  const unknown = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim() || /^\s/.test(rawLine)) continue;
    const line = rawLine.trim();
    if (DIAG_RE.test(line) || ALT_DIAG_RE.test(line) || GLOBAL_DIAG_RE.test(line)) continue;
    if (
      /^(?:error|warning|Error)(?:\s|:)/.test(line) ||
      /^.+?\(\d+,\d+\): (?:error|warning) /.test(line) ||
      /^.+?:\d+:\d+\s*-\s*(?:error|warning) /.test(line)
    ) {
      unknown.push(line);
    }
  }
  return unknown;
};

/**
 * Single evidence rule for live runs and replayed logs alike: a non-zero exit
 * must have produced parseable diagnostics, and no unrecognized error line
 * may have been dropped. Returns the failure reason or null.
 */
export const diagnosticEvidenceError = ({ exit, diagCount, text, where }) => {
  const unknown = collectUnknownErrorLines(text);
  if (unknown.length)
    return `${where}: ${unknown.length} unrecognized error line(s) — unknown error categories block, never silently dropped:\n${unknown.slice(0, 10).join('\n')}`;
  if (exit !== 0 && diagCount === 0)
    return `${where}: exit ${exit} with zero parseable diagnostics — no evidence`;
  return null;
};

const tryVersion = (args, cwd) => {
  try {
    return execFileSync('pnpm', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'absent';
  }
};

/**
 * A tsconfig's effective options live in its `extends` chain, so the
 * fingerprint must cover every reachable config file, not just the entry
 * point. tsconfig is JSONC — strip comments and trailing commas before the
 * shallow `extends` read.
 */
const tsconfigChain = (root, entry) => {
  const files = [];
  const seen = new Set();
  const visit = (configPath) => {
    const key = path.normalize(configPath);
    if (seen.has(key) || seen.size > 16) return;
    seen.add(key);
    files.push(configPath);
    let parsed;
    try {
      const src = readFileSync(configPath, 'utf8')
        .replaceAll(/\/\*.*?\*\//gs, '')
        .replaceAll(/\/\/[^\n]*/g, '')
        .replaceAll(/,(\s*[}\]])/g, '$1');
      parsed = JSON.parse(src);
    } catch {
      return;
    }
    const names = [parsed.extends ?? []].flat();
    const require = createRequire(configPath);
    for (const name of names) {
      if (typeof name !== 'string') continue;
      let target = null;
      try {
        if (name.startsWith('.')) {
          target = path.resolve(
            path.dirname(configPath),
            /\.json$/i.test(name) ? name : `${name}.json`,
          );
        } else {
          try {
            target = require.resolve(name);
          } catch {
            target = require.resolve(name.endsWith('.json') ? name : `${name}/tsconfig.json`);
          }
        }
      } catch {
        // Unresolvable extends target — its absence is already fingerprinted
        // through the entry file's own hash.
      }
      if (target && existsSync(target)) visit(target);
    }
  };
  if (existsSync(entry)) visit(entry);
  return files;
};

/**
 * Environment fingerprint: the log is only evidence when it was produced by
 * the same toolchain (node/pnpm/compiler versions) + dependency resolution +
 * effective typecheck configuration (tsconfig extends chain) as the
 * environment evaluating it.
 */
export const envFingerprint = (root, scope) => {
  const h = createHash('sha256');
  h.update(`node:${execSync('node --version', { encoding: 'utf8' }).trim()}\n`);
  h.update(`pnpm:${execSync('pnpm --version', { encoding: 'utf8' }).trim()}\n`);
  h.update(`tsc:${tryVersion(['exec', 'tsc', '--version'], root)}\n`);
  h.update(`tsgo:${tryVersion(['exec', 'tsgo', '--version'], root)}\n`);
  if (scope) {
    h.update(`tsc@${scope}:${tryVersion(['--dir', scope, 'exec', 'tsc', '--version'], root)}\n`);
    h.update(`tsgo@${scope}:${tryVersion(['--dir', scope, 'exec', 'tsgo', '--version'], root)}\n`);
  }
  const lockfile = path.join(root, 'pnpm-lock.yaml');
  h.update(`lock:${existsSync(lockfile) ? sha256(readFileSync(lockfile)) : 'none'}\n`);
  const chain = new Set();
  for (const rel of ['tsconfig.json', scope ? `${scope}/tsconfig.json` : null].filter(Boolean)) {
    for (const file of tsconfigChain(root, path.join(root, rel)))
      chain.add(path.relative(root, file));
  }
  for (const rel of [...chain].sort()) {
    const p = path.join(root, rel);
    h.update(`${rel}:${existsSync(p) ? sha256(readFileSync(p)) : 'absent'}\n`);
  }
  return h.digest('hex');
};

const ENVELOPE_KEYS = [
  'tc-envelope',
  'tc-head-sha',
  'tc-tree-sha',
  'tc-dirty',
  'tc-exit',
  'tc-signal',
  'tc-completed',
  'tc-scope',
  'tc-env-sha256',
  'tc-log-sha256',
];

const OUTPUT_MARKER = '--- tc-output ---';

export class EnvelopeError extends Error {}

/**
 * Parse + validate a captured head log. Envelope is mandatory: every key must
 * be present, the sha/scope must match the caller's claims, the run must be
 * proven complete (exit in {0,1,2}, no signal, tc-completed=1), the tree must
 * have been clean, the environment fingerprint must match the current one,
 * and the payload hash must match the raw bytes after the marker.
 */
export const validateHeadLog = (text, { headSha, scope, envFingerprint, repoRoot }) => {
  const markerIdx = text.indexOf(OUTPUT_MARKER);
  if (markerIdx === -1)
    throw new EnvelopeError(
      `head log has no '${OUTPUT_MARKER}' marker — not a capture artifact (capture with --capture)`,
    );
  const header = text.slice(0, markerIdx);
  const payload = text.slice(markerIdx + OUTPUT_MARKER.length).replace(/^\r?\n/, '');

  const fields = {};
  for (const line of header.split('\n')) {
    // Single literal separator: no ambiguous quantifier overlap (lint-safe).
    const m = /^# (tc-[a-z0-9-]+) (.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2].trim();
  }
  const missing = ENVELOPE_KEYS.filter((k) => !(k in fields));
  if (missing.length)
    throw new EnvelopeError(`head log envelope missing keys: ${missing.join(', ')}`);
  if (fields['tc-envelope'] !== '1')
    throw new EnvelopeError(`unsupported envelope version '${fields['tc-envelope']}'`);
  if (!/^[0-9a-f]{40}$/.test(fields['tc-head-sha']))
    throw new EnvelopeError(`envelope tc-head-sha '${fields['tc-head-sha']}' is not a 40-hex SHA`);
  if (fields['tc-head-sha'] !== headSha)
    throw new EnvelopeError(
      `--head-sha ${headSha} does not match envelope tc-head-sha ${fields['tc-head-sha']}`,
    );
  if (!/^[0-9a-f]{40}$/.test(fields['tc-tree-sha']))
    throw new EnvelopeError(
      `envelope tc-tree-sha '${fields['tc-tree-sha']}' is not a 40-hex git tree SHA`,
    );
  // The envelope's tree must be the git tree OF the claimed commit — a log
  // naming one commit but captured on another's tree is not evidence for
  // `--head-sha`. Checked in the caller's repo when a repoRoot is given.
  if (repoRoot) {
    let resolvedTree;
    try {
      resolvedTree = execSync(`git rev-parse ${fields['tc-head-sha']}^{tree}`, {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
    } catch {
      throw new EnvelopeError(
        `cannot resolve ${fields['tc-head-sha']}^{tree} in ${repoRoot} — the log names a commit this repo does not have`,
      );
    }
    if (resolvedTree !== fields['tc-tree-sha'])
      throw new EnvelopeError(
        `envelope tc-tree-sha ${fields['tc-tree-sha']} ≠ ${fields['tc-head-sha']}^{tree} (${resolvedTree}) — log is not bound to that commit's tree`,
      );
  }
  if (fields['tc-dirty'] !== '0')
    throw new EnvelopeError(
      `head log was captured on a DIRTY working tree (patch sha256 ${fields['tc-dirty-sha256'] ?? '?'}) — the report cannot be attributed to ${headSha}`,
    );
  if (fields['tc-completed'] !== '1')
    throw new EnvelopeError('head log envelope does not prove a completed run (tc-completed ≠ 1)');
  if (fields['tc-signal'] !== 'none')
    throw new EnvelopeError(`head log run was killed by signal ${fields['tc-signal']} (OOM/crash)`);
  if (!['0', '1', '2'].includes(fields['tc-exit']))
    throw new EnvelopeError(
      `head log run exited ${fields['tc-exit']} — not a normal diagnostics exit`,
    );
  const logScope = fields['tc-scope'] === '-' ? null : fields['tc-scope'];
  if (logScope !== (scope ?? null))
    throw new EnvelopeError(
      `head log scope '${fields['tc-scope']}' does not match --scope '${scope ?? '-'}'`,
    );
  if (fields['tc-env-sha256'] !== envFingerprint)
    throw new EnvelopeError(
      `head log env fingerprint ${fields['tc-env-sha256']} ≠ current ${envFingerprint} — toolchain/deps/config differ, the log is not evidence for this checkout`,
    );
  const actualHash = sha256(payload);
  if (fields['tc-log-sha256'] !== actualHash)
    throw new EnvelopeError(
      `head log payload hash mismatch (envelope ${fields['tc-log-sha256']} ≠ ${actualHash}) — log truncated or tampered`,
    );
  if (!payload.trim()) throw new EnvelopeError('head log payload is empty — zero evidence');
  return { exit: Number(fields['tc-exit']), payload };
};

const runTypecheck = (cwd, scope) => {
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
  if (res.error) return { completed: false, error: `spawn failed: ${res.error.message}` };
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.signal || (res.status !== 0 && res.status !== 1 && res.status !== 2))
    return {
      completed: false,
      exit: res.status,
      out,
      signal: res.signal ?? 'none',
    };
  return { completed: true, exit: res.status, out, signal: 'none' };
};

export const matchWaivers = (unmatched, waivers, now = Date.now()) => {
  const unwaived = [];
  const usedWaivers = [];
  const pool = [...waivers];
  for (const d of unmatched) {
    const i = pool.findIndex(
      (w) =>
        w.file === d.file &&
        w.code === d.code &&
        // Waivers are human, per-diagnostic, and time-boxed: no reason or no
        // live expiry means the entry never existed.
        typeof w.reason === 'string' &&
        w.reason.trim().length > 0 &&
        Boolean(w.expires) &&
        Date.parse(w.expires) > now &&
        (d.msg === w.msg || d.msg.startsWith(w.msg)),
    );
    if (i === -1) unwaived.push(d);
    else {
      usedWaivers.push({ diag: `${d.key} — ${d.msg}`, waiver: pool[i] });
      pool.splice(i, 1);
    }
  }
  return { unwaived, usedWaivers };
};

const main = () => {
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
  const captureFile = flag('capture', null);
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const envSha = envFingerprint(repoRoot, scope);

  // --- head diagnostics (caller's working tree, a capture, or a replayed log) ---
  let headDiags;
  let headSha;
  if (headLog) {
    if (!headShaArg)
      fail('--head-log requires --head-sha <sha> naming the commit the log was produced on');
    let replay;
    try {
      replay = validateHeadLog(readFileSync(path.resolve(headLog), 'utf8'), {
        envFingerprint: envSha,
        headSha: headShaArg,
        repoRoot,
        scope,
      });
    } catch (error) {
      if (error instanceof EnvelopeError) fail(error.message);
      throw error;
    }
    headDiags = parseDiagnostics(replay.payload, scope ? `${scope}/` : repoRoot, [
      repoRoot,
      realpathSync(repoRoot),
    ]);
    // Same evidence rule as a live run: a non-zero exit with zero parseable
    // diagnostics, or unrecognized error lines in the payload, is not a diff.
    const replayError = diagnosticEvidenceError({
      exit: replay.exit,
      diagCount: headDiags.length,
      text: replay.payload,
      where: 'head log replay',
    });
    if (replayError) fail(replayError);
    headSha = headShaArg;
  } else {
    headSha = execSync(`git rev-parse ${head}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
    // The report must correspond to the tree it claims to measure: the live
    // head run refuses a checkout that is not exactly `head`, and refuses a
    // dirty tree — a dirty run measures content no SHA names.
    const checkedOut = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (checkedOut !== headSha)
      fail(
        `--head ${head} resolves to ${headSha} but the working tree has ${checkedOut} checked out`,
      );
    const porcelain = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' });
    if (porcelain.trim())
      fail(`working tree is dirty — typecheck output cannot be attributed to ${headSha}`);
    const treeBefore = execSync('git rev-parse HEAD^{tree}', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();

    const run = runTypecheck(repoRoot, scope);
    if (!run.completed)
      fail(
        `head typecheck did not complete (exit=${run.exit ?? '?'}, signal=${run.signal ?? run.error ?? '?'})\n${(run.out ?? '').slice(-2000)}`,
      );
    // The tree must be stable across the run — a typecheck that mutates
    // tracked files measures content no SHA names.
    const treeAfter = execSync('git rev-parse HEAD^{tree}', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (treeAfter !== treeBefore)
      fail(`working tree changed during the head typecheck run (${treeBefore} → ${treeAfter})`);
    if (execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' }).trim())
      fail(
        `head typecheck left the working tree dirty — output cannot be attributed to ${headSha}`,
      );
    const diags = parseDiagnostics(run.out, scope ? `${scope}/` : repoRoot, [
      repoRoot,
      realpathSync(repoRoot),
    ]);
    const liveError = diagnosticEvidenceError({
      exit: run.exit,
      diagCount: diags.length,
      text: run.out,
      where: 'head live run',
    });
    if (liveError) fail(liveError);
    if (captureFile) {
      writeFileSync(
        path.resolve(captureFile),
        [
          '# tc-envelope 1',
          `# tc-head-sha ${headSha}`,
          `# tc-tree-sha ${treeAfter}`,
          '# tc-dirty 0',
          `# tc-exit ${run.exit}`,
          '# tc-signal none',
          '# tc-completed 1',
          `# tc-scope ${scope ?? '-'}`,
          `# tc-env-sha256 ${envSha}`,
          `# tc-log-sha256 ${sha256(run.out)}`,
          OUTPUT_MARKER,
          run.out,
        ].join('\n'),
      );
      console.log(`captured head log → ${captureFile}`);
    }
    headDiags = diags;
  }

  // --- base diagnostics (detached temp worktree so the caller's tree is safe) ---
  const worktreeDir = flag('worktree-dir', null) ?? mkdtempSync(path.join(tmpdir(), 'tc-base-'));
  execFileSync('git', ['worktree', 'add', '--detach', worktreeDir, base], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  try {
    const lockfile = path.join(worktreeDir, 'pnpm-lock.yaml');
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
      runTypecheckGuarded(worktreeDir, scope),
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

    const waivers = waiverFile ? JSON.parse(readFileSync(path.resolve(waiverFile), 'utf8')) : [];
    const { unwaived, usedWaivers } = matchWaivers(unmatched, waivers);

    const baseKeys = new Set(baseDiags.map((d) => d.key));
    const headKeys = new Set(headDiags.map((d) => d.key));
    const exactAdded = headDiags.filter((d) => !baseKeys.has(d.key));

    const report = {
      base: { count: baseDiags.length, ref: base, sha: baseSha },
      env: {
        fingerprint: envSha,
        node: execSync('node --version', { encoding: 'utf8' }).trim(),
        pnpm: execSync('pnpm --version', { encoding: 'utf8' }).trim(),
      },
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

    if (outFile) writeFileSync(path.resolve(outFile), JSON.stringify(report, null, 2));
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
};

/** Base-side run guard — same completion rules as the head side. */
const runTypecheckGuarded = (cwd, scope) => {
  const run = runTypecheck(cwd, scope);
  if (!run.completed) {
    console.error(
      `typecheckDiff BLOCKED: base typecheck did not complete (exit=${run.exit ?? '?'}, signal=${run.signal ?? run.error ?? '?'})\n${(run.out ?? '').slice(-2000)}`,
    );
    process.exit(2);
  }
  const diags = parseDiagnostics(run.out, null, [cwd, realpathSync(cwd)]).length;
  const evidenceError = diagnosticEvidenceError({
    exit: run.exit,
    diagCount: diags,
    text: run.out,
    where: 'base run',
  });
  if (evidenceError) {
    console.error(`typecheckDiff BLOCKED: ${evidenceError}`);
    process.exit(2);
  }
  return run.out;
};

const isMain = () => {
  try {
    return import.meta.url === `file://${realpathSync(process.argv[1])}`;
  } catch {
    return false;
  }
};
if (isMain()) main();
