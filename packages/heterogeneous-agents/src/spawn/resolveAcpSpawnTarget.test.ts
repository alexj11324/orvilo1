import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as acpBridgeInstall from './acpBridgeInstall';
import type * as acpRuntime from './acpRuntime';
import type * as standardAcpAgents from './standardAcpAgents';

const {
  detectAcpBridgeCommandMock,
  detectAcpBridgeRunnerMock,
  detectManagedAcpBridgeCommandMock,
  scheduleManagedAcpBridgeInstallMock,
} = vi.hoisted(() => ({
  detectAcpBridgeCommandMock: vi.fn(),
  detectAcpBridgeRunnerMock: vi.fn(),
  detectManagedAcpBridgeCommandMock: vi.fn(),
  scheduleManagedAcpBridgeInstallMock: vi.fn(),
}));

vi.mock('./acpRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof acpRuntime>()),
  detectAcpBridgeCommand: detectAcpBridgeCommandMock,
  detectAcpBridgeRunner: detectAcpBridgeRunnerMock,
}));

vi.mock('./acpBridgeInstall', async (importOriginal) => ({
  ...(await importOriginal<typeof acpBridgeInstall>()),
  detectManagedAcpBridgeCommand: detectManagedAcpBridgeCommandMock,
  scheduleManagedAcpBridgeInstall: scheduleManagedAcpBridgeInstallMock,
}));

const env = {} as NodeJS.ProcessEnv;
let resolveAcpSpawnTarget: (typeof standardAcpAgents)['resolveAcpSpawnTarget'];
let resetAcpSpawnTargetCache: (typeof standardAcpAgents)['resetAcpSpawnTargetCache'];

describe('resolveAcpSpawnTarget with a missing bridge', () => {
  // The module graph is large; load it once, outside the per-test timeout.
  beforeAll(async () => {
    ({ resolveAcpSpawnTarget, resetAcpSpawnTargetCache } = await import('./standardAcpAgents'));
  }, 30_000);

  beforeEach(() => {
    resetAcpSpawnTargetCache();
    detectManagedAcpBridgeCommandMock.mockReset().mockResolvedValue({ available: false });
    scheduleManagedAcpBridgeInstallMock.mockReset();
    detectAcpBridgeCommandMock.mockReset().mockResolvedValue({ available: false });
    detectAcpBridgeRunnerMock
      .mockReset()
      .mockResolvedValue({ args: ['-y', 'bridge'], commandPath: '/usr/bin/npx' });
  });

  it('falls back to a package runner for a run', async () => {
    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);

    expect(target.commandPath).toBe('/usr/bin/npx');
  });

  it('fails instead of fetching the bridge when the caller forbids the runner', async () => {
    await expect(
      resolveAcpSpawnTarget('claude-code', '/bin/claude', env, { allowPackageRunner: false }),
    ).rejects.toMatchObject({ name: 'AcpBridgeNotFoundError' });
    expect(detectAcpBridgeRunnerMock).not.toHaveBeenCalled();
    expect(scheduleManagedAcpBridgeInstallMock).not.toHaveBeenCalled();
  });

  it('prefers the managed install over the package runner', async () => {
    detectManagedAcpBridgeCommandMock.mockResolvedValue({
      available: true,
      path: '/home/u/.orvilo/acp-bridges/x/node_modules/.bin/claude-agent-acp',
      resolvedPathEnv: '/login/bin',
    });

    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);

    expect(target).toEqual({
      commandArgs: [],
      commandPath: '/home/u/.orvilo/acp-bridges/x/node_modules/.bin/claude-agent-acp',
      env: { CLAUDE_CODE_EXECUTABLE: '/bin/claude', PATH: '/login/bin' },
    });
    expect(detectAcpBridgeRunnerMock).not.toHaveBeenCalled();
    expect(scheduleManagedAcpBridgeInstallMock).not.toHaveBeenCalled();
  });

  it('uses the managed install even when the runner is forbidden', async () => {
    detectManagedAcpBridgeCommandMock.mockResolvedValue({ available: true, path: '/managed/bin' });

    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env, {
      allowPackageRunner: false,
    });

    expect(target.commandPath).toBe('/managed/bin');
  });

  it('starts one background install when falling back to the runner', async () => {
    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);

    expect(target.commandArgs).toEqual(['-y', 'bridge']);
    expect(target.env.CLAUDE_CODE_EXECUTABLE).toBe('/bin/claude');
    expect(scheduleManagedAcpBridgeInstallMock).toHaveBeenCalledTimes(1);
    expect(scheduleManagedAcpBridgeInstallMock).toHaveBeenCalledWith(
      expect.objectContaining({ package: '@agentclientprotocol/claude-agent-acp' }),
      { args: ['-y', 'bridge'], commandPath: '/usr/bin/npx' },
      env,
    );
  });
});

describe('resolveAcpSpawnTarget with the bridge on PATH', () => {
  beforeAll(async () => {
    ({ resolveAcpSpawnTarget, resetAcpSpawnTargetCache } = await import('./standardAcpAgents'));
  }, 30_000);

  beforeEach(() => {
    resetAcpSpawnTargetCache();
    detectManagedAcpBridgeCommandMock.mockReset();
    scheduleManagedAcpBridgeInstallMock.mockReset();
    detectAcpBridgeRunnerMock.mockReset();
    detectAcpBridgeCommandMock
      .mockReset()
      .mockResolvedValue({ available: true, path: 'claude-agent-acp-on-path' });
  });

  it('launches the PATH bridge without touching the managed install', async () => {
    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);

    expect(target).toEqual({
      commandArgs: [],
      commandPath: 'claude-agent-acp-on-path',
      env: { CLAUDE_CODE_EXECUTABLE: '/bin/claude' },
    });
    expect(detectManagedAcpBridgeCommandMock).not.toHaveBeenCalled();
    expect(scheduleManagedAcpBridgeInstallMock).not.toHaveBeenCalled();
  });

  it('reuses a cached resolution without re-probing', async () => {
    await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);
    const second = await resolveAcpSpawnTarget('claude-code', '/bin/claude-2', {
      FOO: '1',
    } as NodeJS.ProcessEnv);
    const third = await resolveAcpSpawnTarget('claude-code', '/bin/claude', {
      FOO: '2',
    } as NodeJS.ProcessEnv);

    // Different vendor command → different key → one more probe; the third
    // call hits the first entry and still carries its own caller env.
    expect(detectAcpBridgeCommandMock).toHaveBeenCalledTimes(2);
    expect(second.env.CLAUDE_CODE_EXECUTABLE).toBe('/bin/claude-2');
    expect(third.env).toEqual({ CLAUDE_CODE_EXECUTABLE: '/bin/claude', FOO: '2' });
  });

  it('re-probes after the cache TTL expires', async () => {
    vi.useFakeTimers();
    try {
      await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);
      vi.advanceTimersByTime(61_000);
      await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);
    } finally {
      vi.useRealTimers();
    }

    expect(detectAcpBridgeCommandMock).toHaveBeenCalledTimes(2);
  });

  it('does not serve a cached runner launch to a caller that forbids the runner', async () => {
    detectAcpBridgeCommandMock.mockResolvedValue({ available: false });
    detectManagedAcpBridgeCommandMock.mockResolvedValue({ available: false });
    detectAcpBridgeRunnerMock.mockResolvedValue({ args: ['pkg@1'], commandPath: 'bunx' });

    await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);
    await expect(
      resolveAcpSpawnTarget('claude-code', '/bin/claude', env, { allowPackageRunner: false }),
    ).rejects.toMatchObject({ name: 'AcpBridgeNotFoundError' });
  });
});
