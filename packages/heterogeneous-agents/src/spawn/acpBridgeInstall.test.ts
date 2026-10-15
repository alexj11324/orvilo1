import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACP_BRIDGE_DIR_ENV,
  detectManagedAcpBridgeCommand,
  ensureManagedAcpBridgeInstall,
  getManagedAcpBridgeDir,
  resetManagedAcpBridgeInstallState,
  resolveAcpBridgeRoot,
  scheduleManagedAcpBridgeInstall,
} from './acpBridgeInstall';
import type { AcpBridgeRunnerTarget } from './acpRuntime';
import { ACP_AGENT_RUNTIMES } from './acpRuntime';

const { existing, spawnMock, renameMock, mkdirMock, validateMock } = vi.hoisted(() => ({
  existing: new Set<string>(),
  mkdirMock: vi.fn(),
  renameMock: vi.fn(),
  spawnMock: vi.fn(),
  validateMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('node:fs', () => ({ existsSync: (p: string) => existing.has(p) }));
vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  readdir: vi.fn(async () => []),
  rename: renameMock,
  rm: vi.fn(async () => {}),
  stat: vi.fn(async () => undefined),
}));
vi.mock('./cliSpawn', () => ({
  resolveCliSpawnPlan: async (command: string, args: string[]) => ({ args, command }),
}));
vi.mock('./resolveCliCommand', () => ({ detectValidatedCommandCandidates: validateMock }));

const spec = ACP_AGENT_RUNTIMES['claude-code'].bridge;
const ROOT = '/managed-root';
const env = { [ACP_BRIDGE_DIR_ENV]: ROOT, PATH: '/usr/bin' } as NodeJS.ProcessEnv;
const installDir = path.join(ROOT, 'agentclientprotocol_claude-agent-acp@0.76.0');
const binIn = (dir: string) => path.join(dir, 'node_modules', '.bin', 'claude-agent-acp');

const bunxRunner: AcpBridgeRunnerTarget = {
  args: ['@agentclientprotocol/claude-agent-acp@0.76.0'],
  commandPath: '/home/u/.bun/bin/bunx',
};
const npxRunner: AcpBridgeRunnerTarget = {
  args: [],
  commandPath: '/usr/local/bin/npx',
  resolvedPathEnv: '/login/bin',
};

type FakeChild = EventEmitter & { kill: () => void; unref: () => void };

/** Fake installer: exits with `code` on the next tick, writing the bin on success. */
const installerExits = (code: number) =>
  spawnMock.mockImplementation((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      unref: vi.fn(),
    }) as FakeChild;
    const flag = args.includes('--cwd') ? '--cwd' : '--prefix';
    const staging = args[args.indexOf(flag) + 1];
    setTimeout(() => {
      if (code === 0) existing.add(binIn(staging));
      child.emit('exit', code);
    }, 0);
    return child;
  });

beforeEach(() => {
  existing.clear();
  resetManagedAcpBridgeInstallState();
  spawnMock.mockReset();
  validateMock.mockReset();
  mkdirMock.mockReset().mockResolvedValue(undefined);
  renameMock.mockReset().mockImplementation(async (_from: string, to: string) => {
    existing.add(binIn(to));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('managed bridge location', () => {
  it('honours ORVILO_ACP_BRIDGE_DIR', () => {
    expect(resolveAcpBridgeRoot(env)).toBe(ROOT);
    expect(getManagedAcpBridgeDir(spec, env)).toBe(installDir);
  });

  it('defaults under the CLI home, following ORVILO_CLI_HOME', () => {
    vi.stubEnv(ACP_BRIDGE_DIR_ENV, '');
    vi.stubEnv('ORVILO_CLI_HOME', '');
    expect(resolveAcpBridgeRoot({})).toBe(path.join(os.homedir(), '.orvilo', 'acp-bridges'));
    expect(resolveAcpBridgeRoot({ ORVILO_CLI_HOME: '.orvilo-b' })).toBe(
      path.join(os.homedir(), '.orvilo-b', 'acp-bridges'),
    );
  });
});

describe('detectManagedAcpBridgeCommand', () => {
  it('reports unavailable without probing when nothing is installed', async () => {
    await expect(detectManagedAcpBridgeCommand(spec, env)).resolves.toEqual({
      available: false,
    });
    expect(validateMock).not.toHaveBeenCalled();
  });

  it('validates an installed bin with --version', async () => {
    existing.add(binIn(installDir));
    validateMock.mockResolvedValue({ available: true, path: binIn(installDir) });

    await expect(detectManagedAcpBridgeCommand(spec, env)).resolves.toMatchObject({
      available: true,
      path: binIn(installDir),
    });
    expect(validateMock).toHaveBeenCalledWith(
      [binIn(installDir)],
      expect.objectContaining({ validateFlag: '--version' }),
      env,
    );
  });
});

describe('ensureManagedAcpBridgeInstall', () => {
  it('installs once for concurrent callers and moves the staging dir into place', async () => {
    installerExits(0);

    const results = await Promise.all([
      ensureManagedAcpBridgeInstall(spec, bunxRunner, env),
      ensureManagedAcpBridgeInstall(spec, bunxRunner, env),
    ]);
    scheduleManagedAcpBridgeInstall(spec, bunxRunner, env);
    await vi.waitFor(() => expect(existing.has(binIn(installDir))).toBe(true));

    expect(results).toEqual([true, true]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBe('bun');
    expect(args).toEqual([
      'add',
      '--cwd',
      expect.stringContaining(`${ROOT}${path.sep}.tmp-`),
      '--ignore-scripts',
      '--no-summary',
      '@agentclientprotocol/claude-agent-acp@0.76.0',
    ]);
    expect(options).toMatchObject({ stdio: 'ignore' });
    expect(renameMock).toHaveBeenCalledWith(args[2], installDir);
  });

  it('uses npm with the runner PATH when the runner is npx', async () => {
    installerExits(0);

    await expect(ensureManagedAcpBridgeInstall(spec, npxRunner, env)).resolves.toBe(true);

    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBe('npm');
    expect(args).toEqual(
      expect.arrayContaining(['install', '--prefix', '--no-save', '--ignore-scripts']),
    );
    expect(args.at(-1)).toBe('@agentclientprotocol/claude-agent-acp@0.76.0');
    expect(options.env.PATH).toBe('/login/bin');
  });

  it('skips the installer when the managed bin already exists', async () => {
    existing.add(binIn(installDir));

    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(true);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('swallows a failing installer and backs off before retrying', async () => {
    installerExits(1);

    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(false);
    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(false);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('swallows spawn and filesystem errors', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(false);

    resetManagedAcpBridgeInstallState();
    mkdirMock.mockRejectedValue(new Error('EACCES'));
    expect(() => scheduleManagedAcpBridgeInstall(spec, bunxRunner, env)).not.toThrow();
    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(false);
  });

  it('accepts an install another process moved into place first', async () => {
    installerExits(0);
    renameMock.mockImplementation(async () => {
      existing.add(binIn(installDir));
      throw Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' });
    });

    await expect(ensureManagedAcpBridgeInstall(spec, bunxRunner, env)).resolves.toBe(true);
  });
});
