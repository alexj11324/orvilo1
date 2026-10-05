import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentService } from '@/services/agent';
import { discoverService } from '@/services/discover';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

import { installMarketplaceAgents } from './installMarketplaceAgents';

const runtimeConfig = {
  agencyConfig: {
    executionTarget: 'device' as const,
    boundDeviceId: 'host-1',
    heterogeneousProvider: { type: 'orvilo' as const, model: 'prime-model' },
  },
  model: 'prime-model',
  provider: 'openai',
  title: 'Orvilo AI',
};

const mocks = vi.hoisted(() => ({
  forkAgent: vi.fn(),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    market: {
      agent: {
        forkAgent: {
          mutate: mocks.forkAgent,
        },
      },
    },
  },
}));

describe('installMarketplaceAgents', () => {
  const createAgent = vi.fn();
  const refreshAgentList = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    createAgent.mockReset();
    refreshAgentList.mockReset();
    refreshAgentList.mockResolvedValue(undefined);
    mocks.forkAgent.mockReset();

    vi.spyOn(useAgentStore, 'getState').mockReturnValue({
      createAgent,
    } as unknown as ReturnType<typeof useAgentStore.getState>);
    vi.spyOn(useHomeStore, 'getState').mockReturnValue({
      refreshAgentList,
    } as unknown as ReturnType<typeof useHomeStore.getState>);
  });

  it('rejects missing runtime configuration before creating a remote fork', async () => {
    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue(null);
    vi.spyOn(discoverService, 'getAssistantDetail').mockResolvedValue({
      config: {},
      title: 'Writer',
    } as never);
    await expect(installMarketplaceAgents(['template-1'], {} as never)).rejects.toThrow(
      'AGENT_RUNTIME_REQUIRED',
    );
    expect(mocks.forkAgent).not.toHaveBeenCalled();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('sends a single batched fork call carrying every selected agent', async () => {
    const sourceIds = ['src-a', 'src-b', 'src-c'];

    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue(null);
    vi.spyOn(discoverService, 'getAssistantDetail').mockImplementation(
      async ({ identifier }) =>
        ({
          avatar: 'avatar',
          backgroundColor: '#fff',
          category: 'engineering',
          config: {
            params: {},
            model: 'untrusted-model',
            provider: 'untrusted-provider',
            agencyConfig: { boundDeviceId: 'untrusted-host' },
          } as any,
          description: `desc-${identifier}`,
          editorData: {},
          identifier,
          summary: `summary-${identifier}`,
          tags: [],
          title: `Title-${identifier}`,
        }) as any,
    );

    const forkSpy = mocks.forkAgent.mockImplementation(
      async ({
        items,
      }: {
        items: Array<{ identifier: string; name?: string; sourceIdentifier: string }>;
      }) =>
        items.map((item) => ({
          data: {
            agent: {
              createdAt: '2026-01-01',
              forkedFromAgentId: 1,
              id: 1,
              identifier: item.identifier,
              name: item.name ?? '',
              ownerId: 1,
              updatedAt: '2026-01-01',
            },
            source: { agentId: 1, identifier: item.sourceIdentifier, versionNumber: 1 },
            version: { agentId: 1, createdAt: '2026-01-01', id: 1, versionNumber: 1 },
          },
          sourceIdentifier: item.sourceIdentifier,
          success: true as const,
        })),
    );

    createAgent.mockImplementation(async ({ config }: any) => ({
      agentId: `agent-${config.params.forkedFromIdentifier}`,
    }));

    const result = await installMarketplaceAgents(sourceIds, { runtimeConfig });

    expect(forkSpy).toHaveBeenCalledTimes(1);
    const [{ items }] = forkSpy.mock.calls[0];
    expect(items).toHaveLength(3);
    expect(items.map((i: { sourceIdentifier: string }) => i.sourceIdentifier)).toEqual(sourceIds);

    expect(createAgent).toHaveBeenCalledTimes(3);
    for (const [{ config }] of createAgent.mock.calls) {
      expect(config.agencyConfig).toEqual(runtimeConfig.agencyConfig);
      expect(config.model).toBe(runtimeConfig.model);
      expect(config.provider).toBe(runtimeConfig.provider);
      expect(config.title).toMatch(/^Title-src-/);
    }
    expect(result.installedAgentIds).toHaveLength(3);
    expect(result.skippedAgentIds).toEqual([]);
    expect(refreshAgentList).toHaveBeenCalledTimes(1);
  });

  it('skips already-forked agents at the dedupe step', async () => {
    const sourceIds = ['src-a', 'src-b', 'src-c'];

    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockImplementation(async (id) =>
      id === 'src-a' ? null : `existing-${id}`,
    );
    vi.spyOn(discoverService, 'getAssistantDetail').mockImplementation(
      async ({ identifier }) =>
        ({
          avatar: 'a',
          backgroundColor: '#fff',
          category: 'engineering',
          config: {
            params: {},
            model: 'untrusted-model',
            provider: 'untrusted-provider',
            agencyConfig: { boundDeviceId: 'untrusted-host' },
          } as any,
          description: 'd',
          editorData: {},
          identifier,
          summary: 's',
          tags: [],
          title: 'T',
        }) as any,
    );
    const forkSpy = mocks.forkAgent.mockImplementation(
      async ({
        items,
      }: {
        items: Array<{ identifier: string; name?: string; sourceIdentifier: string }>;
      }) =>
        items.map((item) => ({
          data: {
            agent: {
              createdAt: '',
              forkedFromAgentId: 1,
              id: 1,
              identifier: item.identifier,
              name: item.name ?? '',
              ownerId: 1,
              updatedAt: '',
            },
            source: { agentId: 1, identifier: item.sourceIdentifier, versionNumber: 1 },
            version: { agentId: 1, createdAt: '', id: 1, versionNumber: 1 },
          },
          sourceIdentifier: item.sourceIdentifier,
          success: true as const,
        })),
    );
    createAgent.mockImplementation(async ({ config }: any) => ({
      agentId: `agent-${config.params.forkedFromIdentifier}`,
    }));

    const result = await installMarketplaceAgents(sourceIds, { runtimeConfig });

    expect(forkSpy).toHaveBeenCalledTimes(1);
    const [{ items }] = forkSpy.mock.calls[0];
    expect(items.map((i: { sourceIdentifier: string }) => i.sourceIdentifier)).toEqual(['src-a']);
    expect(result.skippedAgentIds).toEqual(['src-b', 'src-c']);
    expect(result.installedAgentIds).toEqual(['agent-src-a']);
  });
});
