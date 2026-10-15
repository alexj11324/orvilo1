import { AgentBuilderManifest } from '@orvilo/builtin-tool-agent-builder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentBuilderRuntime } from '../agentBuilder';

const { mockGetAgentConfigById, mockUpdateAgent, mockUpdateConfig } = vi.hoisted(() => ({
  mockGetAgentConfigById: vi.fn(),
  mockUpdateAgent: vi.fn(),
  mockUpdateConfig: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return {
      getAgentConfigById: mockGetAgentConfigById,
      update: mockUpdateAgent,
      updateConfig: mockUpdateConfig,
    };
  }),
}));

const createRuntime = () =>
  agentBuilderRuntime.factory({
    editingAgentId: 'agent-1',
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user-1',
  });

describe('agentBuilderRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableModels', () => {
    // The user-managed provider runtime is retired: getAvailableModels serves
    // the static model-bank catalog, identical for every user.
    it('serves the builtin chat-model catalog grouped by provider', async () => {
      const result = await createRuntime().getAvailableModels({});

      expect(result.success).toBe(true);
      const { providers } = result.state as {
        providers: Array<{ id: string; models: Array<{ id: string }>; name: string }>;
      };
      expect(providers.length).toBeGreaterThan(0);
      for (const provider of providers) {
        expect(provider.models.length).toBeGreaterThan(0);
        for (const model of provider.models) {
          expect(model.id).toBeTruthy();
        }
      }
      expect(result.content).toContain('enabled provider');
    });

    it('filters the catalog by providerId', async () => {
      const result = await createRuntime().getAvailableModels({ providerId: 'openai' });

      expect(result.success).toBe(true);
      const { providers } = result.state as {
        providers: Array<{ id: string; models: unknown[] }>;
      };
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('openai');
    });
  });

  describe('updateConfig - togglePlugin', () => {
    it('appends a new pinned entry when enabling an absent identifier', async () => {
      mockGetAgentConfigById.mockResolvedValue({ id: 'agent-1', plugins: ['plugin-a'] });

      const runtime = createRuntime();
      const result = await runtime.updateConfig(
        { togglePlugin: { enabled: true, pluginId: 'plugin-b' } },
        { editingAgentId: 'agent-1', toolManifestMap: {} },
      );

      expect(result.success).toBe(true);
      expect(result.state).toMatchObject({ agentId: 'agent-1' });
      expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', {
        plugins: ['plugin-a', { identifier: 'plugin-b', mode: 'pinned' }],
      });
    });

    it('flips an existing disabled object entry back to pinned in place, without duplicating it', async () => {
      mockGetAgentConfigById.mockResolvedValue({
        id: 'agent-1',
        plugins: ['plugin-a', { identifier: 'plugin-b', mode: 'disabled' }],
      });

      const runtime = createRuntime();
      const result = await runtime.updateConfig(
        { togglePlugin: { enabled: true, pluginId: 'plugin-b' } },
        { editingAgentId: 'agent-1', toolManifestMap: {} },
      );

      expect(result.success).toBe(true);
      expect(result.state).toMatchObject({ agentId: 'agent-1' });
      expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', {
        plugins: ['plugin-a', { identifier: 'plugin-b', mode: 'pinned' }],
      });
    });

    it('disabling (enabled: false) reverts the entry to auto, removing it from the array', async () => {
      mockGetAgentConfigById.mockResolvedValue({
        id: 'agent-1',
        plugins: ['plugin-a', 'plugin-b'],
      });

      const runtime = createRuntime();
      const result = await runtime.updateConfig(
        { togglePlugin: { enabled: false, pluginId: 'plugin-b' } },
        { editingAgentId: 'agent-1', toolManifestMap: {} },
      );

      expect(result.success).toBe(true);
      expect(result.state).toMatchObject({ agentId: 'agent-1' });
      expect(mockUpdateConfig).toHaveBeenCalledWith('agent-1', { plugins: ['plugin-a'] });
    });

    it('returns the invocation target for a successful no-op', async () => {
      mockGetAgentConfigById.mockResolvedValue({ id: 'agent-1', plugins: [] });

      const runtime = createRuntime();
      const result = await runtime.updateConfig(
        {},
        { editingAgentId: 'agent-1', toolManifestMap: {} },
      );

      expect(result).toMatchObject({
        state: { agentId: 'agent-1', success: true },
        success: true,
      });
    });

    it('applies metadata nested under config instead of reporting a successful no-op', async () => {
      mockGetAgentConfigById.mockResolvedValue({ id: 'agent-1', plugins: [] });

      const runtime = createRuntime();
      const params = {
        config: {
          meta: {
            avatar: '🤖',
            title: 'GitHub PR/Issue Manager',
          },
        },
      } as unknown as Parameters<typeof runtime.updateConfig>[0];
      const result = await runtime.updateConfig(params, {
        editingAgentId: 'agent-1',
        toolManifestMap: {},
      });

      expect(result).toMatchObject({
        state: { agentId: 'agent-1', success: true },
        success: true,
      });
      expect(mockUpdateAgent).toHaveBeenCalledWith('agent-1', {
        avatar: '🤖',
        title: 'GitHub PR/Issue Manager',
      });
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });
  });

  describe('updatePrompt', () => {
    it('writes and returns the editing agent captured by the invocation', async () => {
      const runtime = createRuntime();
      const result = await runtime.updatePrompt(
        { prompt: 'run-scoped prompt' },
        {
          agentId: 'builder-agent',
          editingAgentId: 'target-agent',
          toolManifestMap: {},
        },
      );

      expect(mockUpdateAgent).toHaveBeenCalledWith('target-agent', {
        editorData: null,
        systemRole: 'run-scoped prompt',
      });
      expect(result).toMatchObject({
        state: {
          agentId: 'target-agent',
          newPrompt: 'run-scoped prompt',
          success: true,
        },
        success: true,
      });
    });
  });

  it('does not advertise or execute retired Marketplace tools', () => {
    const runtime = createRuntime();
    const apiNames = AgentBuilderManifest.api.map((api) => api.name);

    for (const name of ['searchMarketTools', 'installPlugin']) {
      expect(apiNames).not.toContain(name);
      expect(runtime[name]).toBeUndefined();
    }
  });
});
