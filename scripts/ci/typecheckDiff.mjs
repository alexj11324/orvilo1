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
 *     checkout, or a dirty working tree — the report must correspond to the
 *     tree it claims to measure;
 *   - `--head-log` whose envelope is missing/incomplete, whose sha/scope/
 *     dirty state is wrong, whose exit/signal/completion fields do not prove
 *     a completed run, whose dependency fingerprint differs from the current
 *     environment, or whose payload hash does not match the raw log bytes.
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
 *   # tc-env-sha256 <64-hex>        — fingerprint: node+pnpm+lockfile+tsconfigs
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
import { tmpdir } from 'node:os';
import path from 'node:path';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// File paths may contain parens (Next.js route groups, e.g. `app/(main)/x.ts`),
// so the matcher is a lazy file part + strict `(<line>,<col>): error TS####:`.
const DIAG_RE = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+):(?<msg>.*)$/;
// tsc epilogue lines are tooling noise, not diagnostic detail — never let them
// extend the previous diagnostic's message.
const EPILOGUE_RE = /^(?:Found \d+ errors?|Errors {2}Files|Total time|Watching for file changes)/;

/**
 * Parse `tsc`/`tsgo` output into diagnostics. Multi-line messages are joined:
 * every line following a diagnostic that does not itself start a diagnostic
 * (and is not epilogue noise) is part of that diagnostic's message.
 */
export const parseDiagnostics = (text, stripPrefix, msgRoots) => {
  const diags = [];
  let current = null;
  const roots = [...msgRoots].sort((a, b) => b.length - a.length);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const m = DIAG_RE.exec(line);
    if (m) {
      if (current) diags.push(current);
      const file = m.groups.file
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
      let msg = m.groups.msg.trim();
      for (const root of roots) msg = msg.replaceAll(root, '<root>');
      current = {
        code: m.groups.code,
        col: Number(m.groups.col),
        file,
        line: Number(m.groups.line),
        msgLines: [msg],
      };
    } else if (current && line && !EPILOGUE_RE.test(line)) {
      let cont = line;
      for (const root of roots) cont = cont.replaceAll(root, '<root>');
      current.msgLines.push(cont);
    } else if (current && EPILOGUE_RE.test(line)) {
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
 * Environment fingerprint: the log is only evidence when it was produced by
 * the same toolchain + dependency resolution + typecheck configuration as the
 * environment evaluating it.
 */
export const envFingerprint = (root, scope) => {
  const h = createHash('sha256');
  h.update(`node:${execSync('node --version', { encoding: 'utf8' }).trim()}\n`);
  h.update(`pnpm:${execSync('pnpm --version', { encoding: 'utf8' }).trim()}\n`);
  const lockfile = path.join(root, 'pnpm-lock.yaml');
  h.update(`lock:${existsSync(lockfile) ? sha256(readFileSync(lockfile)) : 'none'}\n`);
  for (const rel of ['tsconfig.json', scope ? `${scope}/tsconfig.json` : null].filter(Boolean)) {
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
export const validateHeadLog = (text, { headSha, scope, envFingerprint }) => {
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
  return { payload };
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
    let payload;
    try {
      payload = validateHeadLog(readFileSync(path.resolve(headLog), 'utf8'), {
        envFingerprint: envSha,
        headSha: headShaArg,
        scope,
      }).payload;
    } catch (error) {
      if (error instanceof EnvelopeError) fail(error.message);
      throw error;
    }
    headDiags = parseDiagnostics(payload, scope ? `${scope}/` : repoRoot, [
      repoRoot,
      realpathSync(repoRoot),
    ]);
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

    const run = runTypecheck(repoRoot, scope);
    if (!run.completed)
      fail(
        `head typecheck did not complete (exit=${run.exit ?? '?'}, signal=${run.signal ?? run.error ?? '?'})\n${(run.out ?? '').slice(-2000)}`,
      );
    const diags = parseDiagnostics(run.out, scope ? `${scope}/` : repoRoot, [
      repoRoot,
      realpathSync(repoRoot),
    ]);
    if (run.exit !== 0 && diags.length === 0)
      fail(`head typecheck exited ${run.exit} with zero parseable diagnostics — no evidence`);
    if (captureFile) {
      writeFileSync(
        path.resolve(captureFile),
        [
          '# tc-envelope 1',
          `# tc-head-sha ${headSha}`,
          `# tc-tree-sha ${execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf8' }).trim()}`,
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
  if (run.exit !== 0 && diags === 0) {
    console.error(
      `typecheckDiff BLOCKED: base typecheck exited ${run.exit} with zero parseable diagnostics — run did not produce evidence`,
    );
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
