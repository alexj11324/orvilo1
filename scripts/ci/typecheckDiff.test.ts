// @vitest-environment node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  collectUnknownErrorLines,
  diagnosticEvidenceError,
  EnvelopeError,
  matchWaivers,
  parseDiagnostics,
  validateHeadLog,
} from './typecheckDiff.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const SHA = 'a'.repeat(40);
const ENV_FP = 'f'.repeat(64);

const envelope = (overrides, payload) => {
  const fields = {
    'tc-completed': '1',
    'tc-dirty': '0',
    'tc-envelope': '1',
    'tc-env-sha256': ENV_FP,
    'tc-exit': '1',
    'tc-head-sha': SHA,
    'tc-log-sha256': sha256(payload),
    'tc-scope': '-',
    'tc-signal': 'none',
    'tc-tree-sha': 'b'.repeat(40),
    ...overrides,
  };
  return [
    ...Object.entries(fields).map(([k, v]) => `# ${k} ${v}`),
    '--- tc-output ---',
    payload,
  ].join('\n');
};

const opts = { envFingerprint: ENV_FP, headSha: SHA, scope: null };

describe('parseDiagnostics', () => {
  it('does not truncate messages — diagnostics differing past char 300 stay distinct', () => {
    const stem = 'x'.repeat(300);
    const a = `src/a.ts(1,1): error TS2345: ${stem}AAA`;
    const b = `src/a.ts(2,1): error TS2345: ${stem}BBB`;
    const diags = parseDiagnostics(`${a}\n${b}`, '', []);
    expect(diags).toHaveLength(2);
    expect(diags[0].bucket).not.toBe(diags[1].bucket);
    expect(diags[0].msg.length).toBeGreaterThan(300);
  });

  it('joins multi-line messages — continuation lines make otherwise-identical diagnostics distinct', () => {
    const base = `src/a.ts(1,1): error TS2345: Argument of type X\n  Type 'A' is not assignable`;
    const head = `src/a.ts(1,1): error TS2345: Argument of type X\n  Type 'B' is not assignable`;
    const [b] = parseDiagnostics(base, '', []);
    const [h] = parseDiagnostics(head, '', []);
    expect(b.msg).toContain("Type 'A'");
    expect(h.bucket).not.toBe(b.bucket);
  });

  it('does not let epilogue lines extend the last diagnostic', () => {
    const text = `src/a.ts(1,1): error TS2345: boom\nFound 1 error in src/a.ts`;
    const [d] = parseDiagnostics(text, '', []);
    expect(d.msg).toBe('boom');
  });

  it('does not let unindented runner noise extend the last diagnostic — real capture regression', () => {
    const diag = `../../src/utils/client/systemLanguage.ts(7,44): error TS2339: Property 'orviloEnv' does not exist on type 'Window & typeof globalThis'.`;
    const head = parseDiagnostics(
      `${diag}\nScope: all 114 workspace projects\n../.. | [WARN] deprecated foo@1`,
      '',
      [],
    );
    const base = parseDiagnostics(`${diag}\n[ELIFECYCLE] Command failed with exit code 1.`, '', []);
    expect(head[0].msg).toBe(
      `Property 'orviloEnv' does not exist on type 'Window & typeof globalThis'.`,
    );
    expect(head[0].bucket).toBe(base[0].bucket);
  });

  it('parses parenthesized route-group file paths', () => {
    const text = `src/app/(main)/x.ts(3,9): error TS2322: bad`;
    const [d] = parseDiagnostics(text, '', []);
    expect(d).toMatchObject({ code: 'TS2322', file: 'src/app/(main)/x.ts' });
  });

  it('parses file-less global diagnostics — `error TS5083:` is evidence, not noise (CE07)', () => {
    const text = `error TS5083: Cannot read file 'tsconfig.json'.\nsrc/a.ts(1,1): error TS2345: boom`;
    const diags = parseDiagnostics(text, '', []);
    expect(diags).toHaveLength(2);
    expect(diags[0]).toMatchObject({
      code: 'TS5083',
      col: 0,
      file: '<global>',
      line: 0,
    });
    expect(diags[0].bucket).toBe("<global>|TS5083|Cannot read file 'tsconfig.json'.");
    expect(diags[1].file).toBe('src/a.ts');
  });

  it('a global diagnostic alone leaves a nonzero exit with parseable evidence', () => {
    const text = `error TS5023: Unknown compiler option 'foo'.`;
    const diags = parseDiagnostics(text, '', []);
    expect(diags).toHaveLength(1);
    expect(
      diagnosticEvidenceError({ diagCount: diags.length, exit: 2, text, where: 't' }),
    ).toBeNull();
  });

  it('parses the colon-format `file:l:c - error TS####:` spelling', () => {
    const [d] = parseDiagnostics(`src/a.ts:4:2 - error TS2304: nope`, '', []);
    expect(d).toMatchObject({ code: 'TS2304', col: 2, file: 'src/a.ts', line: 4 });
  });
});

describe('collectUnknownErrorLines / diagnosticEvidenceError', () => {
  it('flags unknown error categories instead of dropping them as noise', () => {
    const lines = [
      'src/a.ts(1,1): error ESLint9: bad', // located, non-TS code
      'error ESLint: boom', // global, non-TS code
      'error TS5023', // malformed — no colon
      'error: codeless', // no code at all
      'warning TS18003: x', // warning kind is not an accepted category
      'src/a.ts:1:2 - warning TS6133: x', // colon-format warning
      'Error: Cannot find module', // crash-shaped
    ];
    expect(collectUnknownErrorLines(lines.join('\n'))).toHaveLength(lines.length);
  });

  it('does not flag runner chatter or recognized diagnostics', () => {
    const text = [
      'src/a.ts(1,1): error TS2345: boom',
      'error TS5083: Cannot read file',
      'Scope: all 114 workspace projects',
      '../.. | [WARN] deprecated foo@1',
      '[ELIFECYCLE] Command failed with exit code 2.',
      'ERROR Command failed with exit code 2.',
      'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL',
      'npm ERR! code 1',
      'Found 1 error in src/a.ts',
    ].join('\n');
    expect(collectUnknownErrorLines(text)).toHaveLength(0);
  });

  it('diagnosticEvidenceError blocks a nonzero exit with zero parseable diagnostics (CE08)', () => {
    expect(
      diagnosticEvidenceError({
        diagCount: 0,
        exit: 2,
        text: 'garbage\n',
        where: 'head log replay',
      }),
    ).toMatch(/zero parseable diagnostics/);
    expect(
      diagnosticEvidenceError({
        diagCount: 1,
        exit: 1,
        text: 'src/a.ts(1,1): error TS2345: boom\nerror ESLint: sneaky\n',
        where: 'head live run',
      }),
    ).toMatch(/unrecognized error line/);
    expect(
      diagnosticEvidenceError({
        diagCount: 1,
        exit: 1,
        text: 'src/a.ts(1,1): error TS2345: boom\n',
        where: 't',
      }),
    ).toBeNull();
    expect(diagnosticEvidenceError({ diagCount: 0, exit: 0, text: '', where: 't' })).toBeNull();
  });
});

describe('validateHeadLog', () => {
  const good = 'src/a.ts(1,1): error TS2345: boom\n';

  it('accepts a complete envelope and returns the payload', () => {
    const { payload } = validateHeadLog(envelope({}, good), opts);
    expect(payload).toBe(good);
  });

  it('rejects a raw log with no envelope marker — reused logs must be captured artifacts', () => {
    expect(() => validateHeadLog(`# tc-head-sha ${SHA}\n${good}`, opts)).toThrow(EnvelopeError);
    expect(() => validateHeadLog(good, opts)).toThrow(/marker/);
  });

  it.each([
    ['tc-completed', { 'tc-completed': '0' }],
    ['tc-signal SIGKILL (OOM)', { 'tc-signal': 'SIGKILL' }],
    ['tc-exit 137', { 'tc-exit': '137' }],
    ['dirty capture', { 'tc-dirty': '1', 'tc-dirty-sha256': 'e'.repeat(64) }],
    ['sha mismatch', { 'tc-head-sha': 'c'.repeat(40) }],
    ['scope mismatch', { 'tc-scope': 'apps/server' }],
    ['env fingerprint drift', { 'tc-env-sha256': '0'.repeat(64) }],
    ['tampered payload hash', { 'tc-log-sha256': '0'.repeat(64) }],
  ])('rejects an envelope whose %s field is wrong', (_label, overrides) => {
    expect(() => validateHeadLog(envelope(overrides, good), opts)).toThrow(EnvelopeError);
  });

  it.each(EnvelopeError ? [['tc-exit'], ['tc-completed'], ['tc-env-sha256']] : [])(
    'rejects an envelope missing %s',
    (key) => {
      const fields = {
        'tc-completed': '1',
        'tc-dirty': '0',
        'tc-envelope': '1',
        'tc-env-sha256': ENV_FP,
        'tc-exit': '1',
        'tc-head-sha': SHA,
        'tc-log-sha256': sha256(good),
        'tc-scope': '-',
        'tc-signal': 'none',
        'tc-tree-sha': 'b'.repeat(40),
      };
      delete fields[key];
      const text = [
        ...Object.entries(fields).map(([k, v]) => `# ${k} ${v}`),
        '--- tc-output ---',
        good,
      ].join('\n');
      expect(() => validateHeadLog(text, opts)).toThrow(/missing keys/);
    },
  );

  it('rejects an empty payload — zero evidence', () => {
    expect(() => validateHeadLog(envelope({}, ''), opts)).toThrow(/empty/);
  });

  it('rejects a non-hex tc-tree-sha (CE09)', () => {
    expect(() => validateHeadLog(envelope({ 'tc-tree-sha': 'not-a-tree' }, good), opts)).toThrow(
      /tc-tree-sha/,
    );
  });

  describe('with repoRoot git binding', () => {
    const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const treeSha = execSync('git rev-parse HEAD^{tree}', { encoding: 'utf8' }).trim();
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const gitOpts = { envFingerprint: ENV_FP, headSha, repoRoot, scope: null };

    it('accepts an envelope whose tree-sha is the commit’s actual git tree', () => {
      const { payload, exit } = validateHeadLog(
        envelope({ 'tc-head-sha': headSha, 'tc-tree-sha': treeSha }, good),
        gitOpts,
      );
      expect(payload).toBe(good);
      expect(exit).toBe(1);
    });

    it('rejects a tree-sha that is not the claimed commit’s tree', () => {
      const wrongTree = execSync('git rev-parse HEAD^{tree}', { encoding: 'utf8' })
        .trim()
        .replace(/^../, '00');
      expect(() =>
        validateHeadLog(
          envelope({ 'tc-head-sha': headSha, 'tc-tree-sha': wrongTree }, good),
          gitOpts,
        ),
      ).toThrow(/not bound to that commit's tree/);
    });

    it('rejects a head-sha this repo cannot resolve', () => {
      expect(() =>
        validateHeadLog(envelope({ 'tc-head-sha': 'f'.repeat(40), 'tc-tree-sha': treeSha }, good), {
          ...gitOpts,
          headSha: 'f'.repeat(40),
        }),
      ).toThrow(/cannot resolve/);
    });
  });
});

describe('matchWaivers', () => {
  const diag = {
    bucket: 'src/a.ts|TS2345|boom',
    file: 'src/a.ts',
    code: 'TS2345',
    key: 'src/a.ts:1:1 TS2345',
    msg: 'boom',
  };
  const live = new Date(Date.now() + 86_400_000).toISOString();
  const dead = new Date(Date.now() - 86_400_000).toISOString();

  it('consumes a reasoned, unexpired, exact waiver', () => {
    const { unwaived, usedWaivers } = matchWaivers(
      [diag],
      [{ code: 'TS2345', expires: live, file: 'src/a.ts', msg: 'boom', reason: 'known upstream' }],
    );
    expect(unwaived).toHaveLength(0);
    expect(usedWaivers).toHaveLength(1);
  });

  it.each([
    ['missing reason', { code: 'TS2345', expires: live, file: 'src/a.ts', msg: 'boom' }],
    ['empty reason', { code: 'TS2345', expires: live, file: 'src/a.ts', msg: 'boom', reason: ' ' }],
    ['missing expiry', { code: 'TS2345', file: 'src/a.ts', msg: 'boom', reason: 'r' }],
    ['expired', { code: 'TS2345', expires: dead, file: 'src/a.ts', msg: 'boom', reason: 'r' }],
    ['wrong file', { code: 'TS2345', expires: live, file: 'src/b.ts', msg: 'boom', reason: 'r' }],
    ['wrong code', { code: 'TS2300', expires: live, file: 'src/a.ts', msg: 'boom', reason: 'r' }],
  ])('refuses a waiver with %s', (_label, waiver) => {
    const { unwaived } = matchWaivers([diag], [waiver]);
    expect(unwaived).toHaveLength(1);
  });

  it('each waiver is consumed once — two identical diagnostics need two waivers', () => {
    const { unwaived } = matchWaivers(
      [diag, diag],
      [{ code: 'TS2345', expires: live, file: 'src/a.ts', msg: 'boom', reason: 'r' }],
    );
    expect(unwaived).toHaveLength(1);
  });
});
