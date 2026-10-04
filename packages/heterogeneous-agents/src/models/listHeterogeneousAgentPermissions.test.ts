import { beforeEach, describe, expect, it, vi } from 'vitest';

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
