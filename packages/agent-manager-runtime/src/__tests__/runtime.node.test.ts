import { describe, expect, it, vi } from 'vitest';

import { AgentManagerRuntime } from '../AgentManagerRuntime';
import type { AgentManagerCapabilities, AgentManagerRuntimeServices } from '../types';

function fixture() {
  const configs = new Map<string, { plugins: string[]; systemRole: string }>([
    ['agent', { plugins: [], systemRole: 'before' }],
  ]);
  const agents: AgentManagerCapabilities['agents'] = {
    ensureLoaded: vi.fn(async () => {}),
    getConfig: (id) => configs.get(id) as ReturnType<typeof agents.getConfig>,
    getMeta: () => ({}),
    updateConfig: vi.fn(async (id, patch) => {
      Object.assign(configs.get(id)!, patch);
    }),
    updateMeta: vi.fn(async () => {}),
    startStreamingSystemRole: vi.fn(() => 1),
    appendStreamingSystemRole: vi.fn(),
    finishStreamingSystemRole: vi.fn(async () => {}),
  };
  const services: AgentManagerRuntimeServices = {
    capabilities: {
      agents,
      getAvailableModels: async () => [
        { id: 'host', name: 'Host', models: [{ id: 'model', name: 'Model' }] },
      ],
      isPluginInstalled: () => false,
      installPlugin: async (_id, _params, enable) => {
        await enable('plugin');
        return { content: 'connected', success: true };
      },
    },
    agentService: {
      countAgents: vi.fn(),
      createAgent: vi.fn(),
      duplicateAgent: vi.fn(),
      getAgentConfigById: vi.fn(),
      getRuntimeForCreation: vi.fn(),
      queryAgents: vi.fn(),
      removeAgent: vi.fn(),
    },
  };
  return { agents, configs, services, runtime: new AgentManagerRuntime(services) };
}

describe('host-independent runtime (Node, no application store mocks)', () => {
  it('reads the injected model catalog without an application store', async () => {
    expect(typeof window).toBe('undefined');
    const { runtime } = fixture();
    expect((await runtime.getAvailableModels({})).state).toMatchObject({
      providers: [{ id: 'host' }],
    });
  });

  it('serializes streaming and immediate updates across instances without losing the final prompt', async () => {
    const { runtime, services, configs, agents } = fixture();
    const second = new AgentManagerRuntime(services);
    const [firstResult, secondResult] = await Promise.all([
      runtime.updatePrompt('agent', { prompt: 'streaming prompt', streaming: true }),
      second.updatePrompt('agent', { prompt: 'final prompt' }),
    ]);
    expect(firstResult.success).toBe(true);
    expect(secondResult.state).toMatchObject({ previousPrompt: 'streaming prompt' });
    expect(configs.get('agent')?.systemRole).toBe('final prompt');
    expect(agents.finishStreamingSystemRole).toHaveBeenCalledWith('agent', 1);
  });

  it('releases streaming ownership and the queue when persistence fails', async () => {
    const { runtime, agents, configs } = fixture();
    vi.mocked(agents.updateConfig).mockRejectedValueOnce(new Error('offline'));
    expect(
      (await runtime.updatePrompt('agent', { prompt: 'first', streaming: true })).success,
    ).toBe(false);
    expect(agents.finishStreamingSystemRole).toHaveBeenCalledWith('agent', 1);
    expect((await runtime.updatePrompt('agent', { prompt: 'retry' })).success).toBe(true);
    expect(configs.get('agent')?.systemRole).toBe('retry');
  });
});
