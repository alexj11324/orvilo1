import { describe, expect, it } from 'vitest';

import {
  evaluateGateSnapshot,
  selectLatestCheckRun,
  selectLatestRun,
  waitForGate,
} from './vercelPreviewGate.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';

const passedSnapshot = () => {
  const runs = [
    {
      id: 1,
      name: 'Test CI',
      head_sha: sha,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-09-17T00:00:00Z',
    },
    {
      id: 2,
      name: 'E2E CI',
      head_sha: sha,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-09-17T00:01:00Z',
    },
  ];
  return {
    headSha: sha,
    runs,
    jobsByRun: new Map([
      [1, [{ name: 'Typecheck', status: 'completed', conclusion: 'success', steps: [{}] }]],
      [2, [{ name: 'Test Web App', status: 'completed', conclusion: 'success', steps: [{}] }]],
    ]),
    checkRuns: [
      {
        name: 'GitGuardian Security Checks',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-17T00:02:00Z',
      },
      {
        name: 'Check Duplicate Run',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-17T00:03:00Z',
      },
      {
        name: 'Check all PR gates before Vercel',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-09-17T00:04:00Z',
      },
    ],
    statuses: [{ context: 'Vercel', state: 'failure', created_at: '2026-09-17T00:05:00Z' }],
  };
};

describe('Vercel Preview gate', () => {
  it('uses the newest exact-head workflow run', () => {
    expect(
      selectLatestRun(
        [
          {
            id: 1,
            name: 'Test CI',
            head_sha: sha,
            event: 'push',
            created_at: '2026-09-17T00:00:00Z',
          },
          {
            id: 2,
            name: 'Test CI',
            head_sha: sha,
            event: 'push',
            created_at: '2026-09-17T00:01:00Z',
          },
        ],
        { workflowName: 'Test CI', headSha: sha },
      )?.id,
    ).toBe(2);
  });

  it('uses the newest required check result instead of hiding it behind an older pass', () => {
    expect(
      selectLatestCheckRun(
        [
          { id: 1, name: 'GitGuardian Security Checks', started_at: '2026-09-17T00:00:00Z' },
          { id: 2, name: 'GitGuardian Security Checks', started_at: '2026-09-17T00:01:00Z' },
        ],
        'GitGuardian Security Checks',
      )?.id,
    ).toBe(2);
  });

  it('passes only after both CI workflows and security have executed successfully', () => {
    expect(evaluateGateSnapshot(passedSnapshot())).toEqual({ state: 'passed', reasons: [] });
  });

  it('keeps waiting for missing checks and fails closed for a failed security check', () => {
    const snapshot = passedSnapshot();
    snapshot.checkRuns = snapshot.checkRuns.filter(
      (checkRun) => checkRun.name !== 'GitGuardian Security Checks',
    );
    expect(evaluateGateSnapshot(snapshot).state).toBe('pending');

    snapshot.checkRuns.push({
      name: 'GitGuardian Security Checks',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-09-17T00:06:00Z',
    });
    expect(evaluateGateSnapshot(snapshot)).toEqual({
      state: 'failed',
      reasons: ['GitGuardian Security Checks is failure'],
    });
  });

  it('blocks on an unlisted failing check while ignoring the Vercel target status', () => {
    const snapshot = passedSnapshot();
    snapshot.checkRuns.push({
      name: 'Docker PR Build',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-09-17T00:06:00Z',
    });
    expect(evaluateGateSnapshot(snapshot)).toEqual({
      state: 'failed',
      reasons: ['Docker PR Build is failure'],
    });
  });

  it('does not let an older failed rerun hide the newest successful check', () => {
    const snapshot = passedSnapshot();
    snapshot.checkRuns.push(
      {
        name: 'Docker PR Build',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-09-17T00:06:00Z',
      },
      {
        name: 'Docker PR Build',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-17T00:07:00Z',
      },
    );
    expect(evaluateGateSnapshot(snapshot).state).toBe('passed');
  });

  it('retries a transient GitHub API failure before the gate deadline', async () => {
    const originalFetch = globalThis.fetch;
    let transientFailure = true;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (transientFailure && url.includes('/actions/runs?')) {
        transientFailure = false;
        return { ok: false, status: 503, headers: new Headers() } as Response;
      }
      if (url.includes('/actions/runs?')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            workflow_runs: [
              {
                id: 1,
                name: 'Test CI',
                head_sha: sha,
                event: 'push',
                status: 'completed',
                conclusion: 'success',
              },
              {
                id: 2,
                name: 'E2E CI',
                head_sha: sha,
                event: 'push',
                status: 'completed',
                conclusion: 'success',
              },
            ],
          }),
        } as Response;
      }
      if (url.includes('/check-runs?')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            check_runs: [
              { name: 'GitGuardian Security Checks', status: 'completed', conclusion: 'success' },
            ],
          }),
        } as Response;
      }
      if (url.endsWith('/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ statuses: [] }),
        } as Response;
      }
      const runId = url.includes('/1/') ? 1 : 2;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          jobs: [
            runId === 1
              ? { name: 'Typecheck', status: 'completed', conclusion: 'success', steps: [{}] }
              : { name: 'Test Web App', status: 'completed', conclusion: 'success', steps: [{}] },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    try {
      await expect(
        waitForGate({
          apiBase: 'https://api.github.test',
          repository: 'owner/repo',
          token: 'fixture',
          headSha: sha,
          timeoutMs: 1000,
          intervalMs: 1,
          sleep: async () => {},
          now: (() => {
            let current = 0;
            return () => current++;
          })(),
          log: () => {},
        }),
      ).resolves.toEqual({ state: 'passed', reasons: [] });
      expect(transientFailure).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
