import { DEFAULT_AGENT_CONFIG } from '@orvilo/const';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentService } from './agent';

const api = vi.hoisted(() => ({ config: vi.fn(), transfer: vi.fn(), transferMany: vi.fn() }));
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    agent: {
      getAgentConfigById: { query: api.config },
      transferAgent: { mutate: api.transfer },
      transferAgents: { mutate: api.transferMany },
    },
  },
}));

beforeEach(() => {
  api.config.mockReset();
  api.transfer.mockReset();
  api.transferMany.mockReset();
});

describe('agent transfer replacement device', () => {
  it('forwards targetDeviceId for a single transfer', async () => {
    api.transfer.mockResolvedValue({ agentId: 'a', slug: null, transferJobId: null });
    await agentService.transferAgent('a', 'ws-2', 'public', 'device-2');
    expect(api.transfer).toHaveBeenCalledWith({
      agentId: 'a',
      targetDeviceId: 'device-2',
      targetVisibility: 'public',
      targetWorkspaceId: 'ws-2',
    });
  });

  it('forwards targetDeviceId for a batch transfer', async () => {
    api.transferMany.mockResolvedValue([]);
    await agentService.transferAgents(['a', 'b'], null, undefined, 'device-2');
    expect(api.transferMany).toHaveBeenCalledWith({
      agentIds: ['a', 'b'],
      targetDeviceId: 'device-2',
      targetVisibility: undefined,
      targetWorkspaceId: null,
    });
  });
});

describe('full agent configuration consumer boundary', () => {
  it.each(['public', 'private'])(
    'keeps a %s safe profile readable but unavailable to full consumers',
    async (visibility) => {
      const profile = {
        id: 'agent-1',
        title: 'Issue executor',
        visibility,
        workspaceId: 'workspace-1',
        agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      };
      api.config.mockResolvedValue(profile);

      await expect(agentService.getAgentConfigById('agent-1')).resolves.toBe(profile);
      await expect(agentService.getAgentFullConfigById('agent-1')).resolves.toBeNull();
      expect(profile).not.toHaveProperty('params');
      expect(profile).not.toHaveProperty('systemRole');
      expect(profile).not.toHaveProperty('tts');
    },
  );

  it('returns the authorized complete snapshot unchanged, including empty system role', async () => {
    const config = { ...DEFAULT_AGENT_CONFIG, id: 'agent-1' };
    api.config.mockResolvedValue(config);

    await expect(agentService.getAgentFullConfigById('agent-1')).resolves.toBe(config);
  });

  it.each(['params', 'systemRole', 'tts'] as const)(
    'does not promote a snapshot missing %s',
    async (field) => {
      const config = { ...DEFAULT_AGENT_CONFIG, id: 'agent-1' };
      Reflect.deleteProperty(config, field);
      api.config.mockResolvedValue(config);

      await expect(agentService.getAgentFullConfigById('agent-1')).resolves.toBeNull();
    },
  );

  it('preserves an unavailable response', async () => {
    api.config.mockResolvedValue(null);
    await expect(agentService.getAgentFullConfigById('agent-1')).resolves.toBeNull();
  });

  it('propagates a rejected authorized read', async () => {
    const error = new Error('FORBIDDEN');
    api.config.mockRejectedValue(error);
    await expect(agentService.getAgentFullConfigById('agent-1')).rejects.toBe(error);
  });
});
