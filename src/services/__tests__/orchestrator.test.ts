import { beforeEach, expect, it, vi } from 'vitest';

import {
  getOnboardingAgentConfig,
  listConfiguredOrchestrators,
  resolveOnboardingAgentHost,
} from '@/services/orchestrator';

const api = vi.hoisted(() => ({
  rows: vi.fn(),
  config: vi.fn(),
  runtime: vi.fn(),
  devices: vi.fn(),
  bindings: vi.fn(),
}));
vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: (scope: string | null) => ({
    agent: {
      queryAgents: { query: api.rows },
      getAgentConfigById: { query: (params: unknown) => api.config(scope, params) },
      getAgentRuntimeForCreation: { query: api.runtime },
    },
    device: { listDevices: { query: api.devices } },
    providerBinding: { list: { query: api.bindings } },
  }),
}));
vi.mock('@/features/Home/AgentSelect/agentReadiness', () => ({ agentReadiness: () => 'ready' }));
vi.mock('@/features/ConnectAgent/useAgentScan', () => ({ scanLocal: vi.fn() }));
vi.mock('@/platform', () => ({ getHostContext: () => ({ kind: 'desktop' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.devices.mockResolvedValue([]);
  api.bindings.mockResolvedValue({ data: [] });
});

it('keeps a saved default selectable beyond the first page without changing its source runtime', async () => {
  const source = Object.freeze({
    agencyConfig: Object.freeze({
      executionTarget: 'local',
      heterogeneousProvider: Object.freeze({ type: 'codex' }),
    }),
  });
  api.rows
    .mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({ id: `agent-${i}`, title: 'Agent' })),
    )
    .mockResolvedValueOnce([{ id: 'older-default', title: 'Default' }]);
  api.runtime.mockResolvedValue(source);
  const choices = await listConfiguredOrchestrators('workspace-one', 'private');
  expect(choices).toHaveLength(101);
  expect(choices.find((choice) => choice.agent.id === 'older-default')?.runtime?.agencyConfig).toBe(
    source.agencyConfig,
  );
  expect(source.agencyConfig.heterogeneousProvider.type).toBe('codex');
});

it('resumes the transferred Agent in its saved workspace without consulting personal scope', async () => {
  api.config.mockResolvedValue({ id: 'first-agent', workspaceId: 'workspace-one' });
  const saved = await getOnboardingAgentConfig('first-agent', 'workspace-one');
  expect(saved?.workspaceId).toBe('workspace-one');
  expect(api.config).toHaveBeenCalledTimes(1);
  expect(api.config).toHaveBeenCalledWith('workspace-one', { agentId: 'first-agent' });
});

it('resolves a local coding Agent through the platform while keeping Prime on a device', () => {
  expect(
    resolveOnboardingAgentHost({
      executionTarget: 'local',
      boundDeviceId: 'personal-device',
      heterogeneousProvider: { type: 'opencode' },
    }),
  ).toEqual({ executionTarget: 'local', boundDeviceId: 'personal-device' });
  expect(
    resolveOnboardingAgentHost({
      executionTarget: 'local',
      boundDeviceId: 'personal-device',
      heterogeneousProvider: { type: 'orvilo' },
    }).executionTarget,
  ).toBe('device');
});
