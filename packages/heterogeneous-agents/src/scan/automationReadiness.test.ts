import * as childProcess from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkAutomationReadinessOnHost } from './automationReadiness';

const { detect, spawnPlan, directory, remote, primeProbe } = vi.hoisted(() => ({
  detect: vi.fn(),
  primeProbe: vi.fn(),
  directory: vi.fn(),
  remote: vi.fn(),
  spawnPlan: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ access: vi.fn() }));
vi.mock('../spawn/resolveCliCommand', () => ({ detectHeterogeneousCliCommand: detect }));
vi.mock('../spawn/cliSpawn', () => ({ resolveCliSpawnPlan: spawnPlan }));
vi.mock('../spawn/workingDirectory', () => ({ isSpawnableDirectory: directory }));
vi.mock('./scanHost', () => ({ resolveRemotePlatformCommand: remote }));
vi.mock('@orvilo/prime-harness/readiness', () => ({
  probePrimeArtifactInstallation: primeProbe,
}));

describe('automation host readiness', () => {
  let auth: string;
  let help: string;
  let failed: Error | null;

  beforeEach(() => {
    vi.resetAllMocks();
    primeProbe.mockResolvedValue({ installed: true });
    remote.mockResolvedValue({ available: false, error: 'Unknown platform' });
    auth = 'Logged in using ChatGPT';
    help = 'Run Codex non-interactively\nUsage: codex exec [OPTIONS]';
    failed = null;
    detect.mockResolvedValue({
      available: true,
      path: '/validated/codex',
      resolvedPathEnv: '/validated',
    });
    spawnPlan.mockImplementation(async (command, args) => ({ args, command }));
    directory.mockReturnValue(true);
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(childProcess.execFile).mockImplementation(((
      _command: string,
      args: string[],
      _options: childProcess.ExecFileOptions,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(failed, args.includes('status') ? auth : help, '');
      return {} as childProcess.ChildProcess;
    }) as typeof childProcess.execFile);
  });

  it('checks the declared CLI family and PATH without creating a session', async () => {
    const result = await checkAutomationReadinessOnHost({
      agentType: 'codex',
      engine: 'codex-app-server',
    });
    expect(result).toMatchObject({
      authenticated: true,
      executor: 'codex',
      installed: true,
      unattended: true,
    });
    expect(spawnPlan.mock.calls.map((call) => call[1])).toEqual([
      ['login', 'status'],
      ['exec', '--help'],
    ]);
    expect(childProcess.execFile).toHaveBeenCalledWith(
      '/validated/codex',
      ['login', 'status'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: '/validated' }),
        timeout: 1500,
      }),
      expect.any(Function),
    );
  });

  it('does not interpret Not logged in as a successful login even with zero exit', async () => {
    auth = 'Not logged in';
    expect(await checkAutomationReadinessOnHost({ agentType: 'codex' })).toMatchObject({
      authenticated: false,
    });
  });

  it('keeps installation, auth and unattended evidence independent after a timeout', async () => {
    failed = new Error('timeout');
    auth = '';
    expect(await checkAutomationReadinessOnHost({ agentType: 'codex' })).toMatchObject({
      authenticated: 'unknown',
      installed: true,
      unattended: 'unknown',
    });
  });

  it('uses Claude structured auth status and headless flags', async () => {
    auth = '{"loggedIn":false}';
    help = '--print --permission-mode';
    expect(await checkAutomationReadinessOnHost({ agentType: 'claude-code' })).toMatchObject({
      authenticated: false,
      unattended: true,
    });
    expect(spawnPlan).toHaveBeenCalledWith(
      '/validated/codex',
      ['auth', 'status', '--json'],
      expect.any(Object),
    );
  });

  it('does not accept positive Claude auth output from a failed status process', async () => {
    failed = new Error('timeout');
    auth = '{"loggedIn":true}';
    expect(await checkAutomationReadinessOnHost({ agentType: 'claude-code' })).toMatchObject({
      authenticated: 'unknown',
    });
  });

  it('does not invoke an installed executor without a supported read-only auth protocol', async () => {
    expect(await checkAutomationReadinessOnHost({ agentType: 'cursor' })).toMatchObject({
      authenticated: 'unknown',
      installed: true,
      unattended: 'unknown',
    });
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  describe('OpenCode public model readiness', () => {
    const configureProbe = (
      entryOverrides: Record<string, unknown> = {},
      catalogFailed = false,
    ) => {
      const catalog = `opencode/big-pickle\n${JSON.stringify({
        id: 'big-pickle',
        providerID: 'opencode',
        status: 'active',
        api: { url: 'https://opencode.ai/zen/v1' },
        cost: { input: 0, output: 0 },
        headers: {},
        options: {},
        ...entryOverrides,
      })}`;
      vi.mocked(childProcess.execFile).mockImplementation(((
        _command: string,
        args: string[],
        _options: childProcess.ExecFileOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const output =
          args[0] === 'models'
            ? catalog
            : args[0] === 'acp'
              ? 'opencode acp: start ACP (Agent Client Protocol) server'
              : 'opencode run --format --model';
        callback(args[0] === 'models' && catalogFailed ? new Error('timeout') : null, output, '');
        return {} as childProcess.ChildProcess;
      }) as typeof childProcess.execFile);
    };

    it('records keyless public model configuration without claiming ACP access', async () => {
      configureProbe();
      expect(
        await checkAutomationReadinessOnHost({
          agentType: 'opencode',
          model: 'opencode/big-pickle',
        }),
      ).toMatchObject({
        installed: true,
        authenticated: 'unknown',
        credentialRequired: false,
        unattended: true,
      });
      expect(spawnPlan.mock.calls.map((call) => call[1])).toEqual([
        ['acp', '--help'],
        ['run', '--help'],
        ['models', 'opencode', '--verbose'],
      ]);
    });

    it.each([undefined, 'openai/paid-model', 'opencode/unknown'])(
      'keeps auth unknown for model %s',
      async (model) => {
        configureProbe();
        expect(
          await checkAutomationReadinessOnHost({ agentType: 'opencode', model }),
        ).toMatchObject({
          authenticated: 'unknown',
          unattended: true,
        });
      },
    );

    it.each([
      { cost: { input: 1, output: 0 } },
      { status: 'deprecated' },
      { api: { url: 'https://custom.invalid/api' } },
      { headers: { authorization: 'synthetic-only' } },
      { options: { apiKey: 'synthetic-only' } },
    ])('does not treat model metadata %j as keyless auth proof', async (entry) => {
      configureProbe(entry);
      expect(
        await checkAutomationReadinessOnHost({
          agentType: 'opencode',
          model: 'opencode/big-pickle',
        }),
      ).toMatchObject({ authenticated: 'unknown' });
    });

    it('does not accept catalog output from a failed process as auth evidence', async () => {
      configureProbe({}, true);
      expect(
        await checkAutomationReadinessOnHost({
          agentType: 'opencode',
          model: 'opencode/big-pickle',
        }),
      ).toMatchObject({ authenticated: 'unknown' });
    });
  });

  it('checks bound absolute directory access and leaves unverified tools unknown', async () => {
    expect(
      await checkAutomationReadinessOnHost({
        agentType: 'codex',
        cwd: '/repository',
        requiredTools: ['writeIssue'],
      }),
    ).toMatchObject({ repositoryAccessible: true, requiredToolsSupported: 'unknown' });
    expect(access).toHaveBeenCalledWith('/repository', constants.R_OK | constants.X_OK);
    expect(
      await checkAutomationReadinessOnHost({ agentType: 'codex', cwd: 'relative/path' }),
    ).toMatchObject({ repositoryAccessible: false });
    vi.mocked(access).mockRejectedValueOnce(new Error('denied'));
    expect(
      await checkAutomationReadinessOnHost({ agentType: 'codex', cwd: '/denied' }),
    ).toMatchObject({ repositoryAccessible: false });
  });

  it.each(['native', 'orvilo'])(
    'reports the supported Prime executor for %s without CLI probes',
    async (agentType) => {
      const result = await checkAutomationReadinessOnHost({ agentType });
      expect(result).toMatchObject({
        executor: 'prime',
        installed: true,
        authenticated: 'unknown',
        unattended: true,
      });
      expect(result.blockers).toBeUndefined();
      expect(primeProbe).toHaveBeenCalledOnce();
      expect(detect).not.toHaveBeenCalled();
      expect(remote).not.toHaveBeenCalled();
      expect(childProcess.execFile).not.toHaveBeenCalled();
    },
  );

  it('uses only the trusted host artifact argument, not a remote request path', async () => {
    const request = { agentType: 'orvilo', primeArtifact: '/remote/runner.mjs' };
    await checkAutomationReadinessOnHost(request, '/host/runner.mjs');
    expect(primeProbe).toHaveBeenCalledWith('/host/runner.mjs');
  });

  it('keeps a missing resolved host artifact unavailable instead of probing a different bundle', async () => {
    expect(await checkAutomationReadinessOnHost({ agentType: 'orvilo' }, null)).toMatchObject({
      installed: false,
    });
    expect(primeProbe).not.toHaveBeenCalled();
  });

  it('ignores retired engine fields for the builtin Orvilo executor', async () => {
    expect(
      await checkAutomationReadinessOnHost({ agentType: 'orvilo', engine: 'other' }),
    ).toMatchObject({
      executor: 'prime',
      installed: true,
      authenticated: 'unknown',
      unattended: true,
    });
  });

  it.each([false, 'unknown'] as const)(
    'keeps %s installation evidence separate from Prime support',
    async (installed) => {
      primeProbe.mockResolvedValue({ installed });
      expect(await checkAutomationReadinessOnHost({ agentType: 'orvilo' })).toMatchObject({
        executor: 'prime',
        installed,
        authenticated: 'unknown',
        unattended: true,
      });
    },
  );

  it('does not attest Prime repository access, tool support or provider authorization', async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error('denied'));
    expect(
      await checkAutomationReadinessOnHost({
        agentType: 'orvilo',
        cwd: '/denied',
        requiredTools: ['writeIssue'],
      }),
    ).toMatchObject({
      repositoryAccessible: false,
      requiredToolsSupported: 'unknown',
      authenticated: 'unknown',
    });
  });

  it.each([false, true])(
    'does not run auth probes without a binary path (available=%s)',
    async (available) => {
      detect.mockResolvedValue({ available });
      expect(await checkAutomationReadinessOnHost({ agentType: 'codex' })).toMatchObject({
        installed: available,
        authenticated: 'unknown',
      });
      expect(childProcess.execFile).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed payload before host inspection', async () => {
    await expect(
      checkAutomationReadinessOnHost({ agentType: 'codex', requiredTools: [42] } as any),
    ).rejects.toThrow();
    expect(detect).not.toHaveBeenCalled();
  });
});
