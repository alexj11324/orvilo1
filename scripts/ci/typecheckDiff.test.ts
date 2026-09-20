// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
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

  it('parses parenthesized route-group file paths', () => {
    const text = `src/app/(main)/x.ts(3,9): error TS2322: bad`;
    const [d] = parseDiagnostics(text, '', []);
    expect(d).toMatchObject({ code: 'TS2322', file: 'src/app/(main)/x.ts' });
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
