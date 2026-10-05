import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listHeterogeneousAgentPermissions } from './listHeterogeneousAgentPermissions';

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  resolveCommand: vi.fn(),
  resolveTarget: vi.fn(),
}));

vi.mock('../spawn/resolveCliCommand', () => ({ resolveHeteroSpawnCommand: mocks.resolveCommand }));
vi.mock('../spawn/standardAcpAgents', () => ({
  listStandardAcpPermissions: mocks.discover,
  resolveAcpSpawnTarget: mocks.resolveTarget,
}));

describe('permission discovery routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCommand.mockResolvedValue({ command: '/custom/native-cli', pathEnv: '/usr/bin' });
    mocks.resolveTarget.mockResolvedValue({ commandPath: '/custom/acp', env: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the filtered caller environment and proxy without inheriting parent entries', async () => {
    vi.stubEnv('PERMISSION_DISCOVERY_PARENT_ONLY', 'must-not-inherit');
    mocks.resolveTarget.mockImplementationOnce(async (_type, commandPath, env) => ({
      commandPath,
      env,
    }));
    mocks.discover.mockResolvedValue([]);

    await listHeterogeneousAgentPermissions({
      env: {
        CUSTOM_HARNESS_SETTING: 'retained',
        HTTPS_PROXY: 'http://proxy.example:8080',
        PATH: '/custom/bin',
      },
      type: 'codex',
    });

    const childEnv = mocks.discover.mock.calls[0][1].env;
    expect(childEnv).toEqual({
      CUSTOM_HARNESS_SETTING: 'retained',
      HTTPS_PROXY: 'http://proxy.example:8080',
      PATH: ['/custom/bin', '/usr/bin'].join(path.delimiter),
    });
    expect(childEnv.PERMISSION_DISCOVERY_PARENT_ONLY).toBeUndefined();
  });

  it.each(['amp', 'claude-code', 'codebuddy', 'codex', 'kimi-code', 'opencode', 'pi', 'qoder'])(
    'returns only %s advertised permission options',
    async (type) => {
      const catalog = [
        {
          configId: 'permission_mode',
          currentValue: 'default',
          name: 'Permission mode',
          options: [{ name: 'Default', value: 'default' }],
        },
      ];
      mocks.discover.mockResolvedValue(catalog);
      await expect(listHeterogeneousAgentPermissions({ cwd: '/repo', type })).resolves.toEqual(
        catalog,
      );
    },
  );

  it.each(['unsupported-harness', 'cursor', 'orvilo'])(
    'returns an empty catalog for unsupported %s without spawning',
    async (type) => {
      await expect(listHeterogeneousAgentPermissions({ type })).resolves.toEqual([]);
      expect(mocks.resolveCommand).not.toHaveBeenCalled();
    },
  );

  it('preserves harness failures instead of inventing permission choices', async () => {
    mocks.discover.mockRejectedValue(new Error('session/new failed'));
    await expect(listHeterogeneousAgentPermissions({ type: 'codex' })).rejects.toThrow(
      'session/new failed',
    );
  });
});
