import { describe, expect, it } from 'vitest';

import {
  parseErrorStack,
  parseGitCommits,
  parseTestReport,
  resolveStackFilePath,
} from './structuredOutput';

const report = {
  numFailedTests: 1,
  numPassedTests: 1,
  numPendingTests: 1,
  numTotalTests: 3,
  testResults: [
    {
      name: '/work/chat.test.ts',
      assertionResults: [
        { fullName: 'sends messages', status: 'passed', duration: 12 },
        {
          fullName: 'retries on failure',
          status: 'failed',
          failureMessages: ['Expected 200, received 500'],
        },
        { fullName: 'uploads audio', status: 'pending' },
      ],
    },
  ],
};

describe('structured command output', () => {
  it('renders complete Jest/Vitest reports without losing failed or skipped cases', () => {
    const result = parseTestReport(JSON.stringify(report));
    expect(result?.summary).toEqual({ passed: 1, failed: 1, skipped: 1, total: 3 });
    expect(result?.suites[0].tests[1].errors).toEqual(['Expected 200, received 500']);
    expect(result?.suites[0].tests[2].status).toBe('skipped');
  });
  it('does not label incomplete, malformed or inconsistent reports as passing', () => {
    expect(parseTestReport('1 test passed')).toBeUndefined();
    expect(parseTestReport(JSON.stringify(report).slice(0, -3))).toBeUndefined();
    expect(parseTestReport(JSON.stringify({ ...report, numTotalTests: 5 }))).toBeUndefined();
    expect(parseTestReport(JSON.stringify({ ...report, numFailedTests: 0 }))).toBeUndefined();
    expect(parseTestReport(JSON.stringify({ ...report, testResults: [] }))).toBeUndefined();
  });
  it('keeps collection and setup failures visible instead of presenting them as skipped', () => {
    const collectionFailure = {
      success: false,
      numFailedTestSuites: 1,
      numFailedTests: 0,
      numPassedTests: 1,
      numPendingTests: 0,
      numTotalTests: 1,
      testResults: [
        {
          name: 'passing.test.ts',
          status: 'passed',
          assertionResults: [{ fullName: 'works', status: 'passed' }],
        },
        {
          name: 'broken.test.ts',
          status: 'failed',
          message: 'Cannot find module',
          assertionResults: [],
        },
      ],
    };
    expect(parseTestReport(JSON.stringify(collectionFailure))).toBeUndefined();
    expect(
      parseTestReport(JSON.stringify({ ...report, numRuntimeErrorTestSuites: 1 })),
    ).toBeUndefined();
  });
  it('accepts empty reports and explicit todo counters without inventing tests', () => {
    expect(
      parseTestReport(
        JSON.stringify({
          ...report,
          numFailedTests: 0,
          numPassedTests: 0,
          numPendingTests: 0,
          numTotalTests: 0,
          testResults: [],
        }),
      )?.summary.total,
    ).toBe(0);
    expect(
      parseTestReport(JSON.stringify({ ...report, numPendingTests: 0, numTodoTests: 1 }))?.summary
        .skipped,
    ).toBe(1);
  });
  const hash = 'a'.repeat(40);
  const log = `commit ${hash}\nAuthor: Developer <dev@example.com>\nDate:   Fri Oct 9 10:00:00 2026 +0000\n\n    Improve chat\n    \n    Preserve draft state.\n`;
  it('reads standard git log/show commit metadata and the complete message', () => {
    const commits = parseGitCommits('git -C /work log -1', log);
    expect(commits?.[0]).toMatchObject({
      hash,
      author: 'Developer <dev@example.com>',
      message: 'Improve chat\n\nPreserve draft state.',
    });
    expect(parseGitCommits('git show HEAD', log + '\ndiff --git a/a b/a\n')?.[0].hash).toBe(hash);
    expect(
      parseGitCommits('git log -2', log + '\n' + log.replace(hash, 'b'.repeat(40))),
    ).toHaveLength(2);
  });
  it('keeps unsupported git formats, truncated headers and unrelated output raw', () => {
    expect(parseGitCommits('echo test', log)).toBeUndefined();
    expect(parseGitCommits('git log --oneline', 'abcdef1 Improve chat')).toBeUndefined();
    expect(parseGitCommits('git log -1', log.replace('Author:', 'Unknown:'))).toBeUndefined();
    expect(
      parseGitCommits('git log -1', log.replace('Fri Oct 9 10:00:00 2026 +0000', 'invalid')),
    ).toBeUndefined();
  });
  it('recognizes V8 errors in ANSI output and leaves other output untouched', () => {
    expect(
      parseErrorStack(
        '\u001B[31mTypeError: missing value\u001B[0m\n    at send (/work/chat.ts:12:3)',
      ),
    ).toBe('TypeError: missing value\n    at send (/work/chat.ts:12:3)');
    expect(parseErrorStack('Error: missing value')).toBeUndefined();
    expect(parseErrorStack('all tests passed\n    at send (/work/chat.ts:12:3)')).toBeUndefined();
    expect(
      parseErrorStack('Traceback (most recent call last):\n  File "main.py", line 2'),
    ).toBeUndefined();
  });
});

it('extracts actual Node stderr with source context and runtime footer', () => {
  const text =
    '/repo/error.cjs:1\nthrow new TypeError("boom");\n^\n\nTypeError: boom\n    at run (/repo/error.cjs:1:7)\n\nNode.js v24.19.0';
  expect(parseErrorStack(text)).toBe('TypeError: boom\n    at run (/repo/error.cjs:1:7)');
});

describe('stack frame filesystem targets', () => {
  it('resolves absolute paths and encoded local file URLs', () => {
    expect(resolveStackFilePath('/repo/error.js')).toBe('/repo/error.js');
    expect(resolveStackFilePath('file:///repo/my%20file.js')).toBe('/repo/my file.js');
    expect(resolveStackFilePath('file:///C:/repo/error.js')).toBe('C:/repo/error.js');
  });
  it('does not offer runtime pseudo-files, remote URLs or ambiguous paths', () => {
    for (const path of [
      'node:internal/main',
      'https://host/app.js',
      'file://host/app.js',
      'file:///%ZZ',
      'app.js',
    ]) {
      expect(resolveStackFilePath(path)).toBeUndefined();
    }
  });
});
