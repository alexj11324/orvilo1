import { beforeEach, describe, expect, it, vi } from 'vitest';

import { finishOnboardingAndNavigate } from '@/features/Onboarding/finishOnboarding';
import { verifyOnboardingOrchestrator } from '@/services/orchestrator';

const api = vi.hoisted(() => ({
  runtime: vi.fn(),
  devices: vi.fn(),
  scan: vi.fn(),
  preference: vi.fn(),
  bindings: vi.fn(),
  connection: vi.fn(),
  localScan: vi.fn(),
}));
vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: (workspaceId: string | null) => ({
    agent: { getAgentRuntimeForCreation: { query: api.runtime } },
    device: {
      listDevices: { query: api.devices },
      scanAgents: { query: (params: unknown) => api.scan(params, workspaceId) },
    },
    providerBinding: { list: { query: api.bindings }, checkConnection: { mutate: api.connection } },
    workspaceUserSettings: { updatePreference: { mutate: api.preference } },
  }),
}));
vi.mock('@/features/Home/AgentSelect/agentReadiness', () => ({ agentReadiness: vi.fn() }));
vi.mock('@/features/ConnectAgent/useAgentScan', () => ({ scanLocal: api.localScan }));
vi.mock('@/platform', () => ({ getHostContext: () => ({ kind: 'desktop' }) }));
vi.mock('@/features/Conversation/selectAgent', () => ({ selectAgentForConversation: vi.fn() }));
vi.mock('@/utils/onboardingRedirect', () => ({ resolvePostOnboardingTargetUrl: () => '/home' }));

describe('selected onboarding Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.runtime.mockResolvedValue({
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'dev-one',
        heterogeneousProvider: { type: 'opencode' },
      },
    });
    api.devices.mockResolvedValue([{ deviceId: 'dev-one', online: true, scope: 'personal' }]);
    api.scan.mockResolvedValue({ agents: { opencode: { available: true } } });
    api.preference.mockResolvedValue(undefined);
  });
  it('rejects an empty choice before saving or completing', async () => {
    await expect(verifyOnboardingOrchestrator('', 'workspace-one')).rejects.toThrow(
      'ORCHESTRATOR_SETUP_REQUIRED',
    );
    expect(api.preference).not.toHaveBeenCalled();
  });
  it('does not finish or navigate when the chosen device is offline', async () => {
    api.devices.mockResolvedValue([{ deviceId: 'dev-one', online: false }]);
    const finish = vi.fn();
    const navigate = vi.fn();
    await expect(
      finishOnboardingAndNavigate(finish, navigate, () =>
        verifyOnboardingOrchestrator('saved-agent', 'workspace-one'),
      ),
    ).rejects.toThrow('FIRST_AGENT_DEVICE_REQUIRED');
    expect(finish).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(api.preference).not.toHaveBeenCalled();
  });
  it('keeps failed CLI checks retryable and only saves the existing choice after readiness', async () => {
    api.scan.mockResolvedValueOnce({ agents: {}, error: 'probe failed' });
    await expect(verifyOnboardingOrchestrator('saved-agent', 'workspace-one')).rejects.toThrow(
      'probe failed',
    );
    expect(api.preference).not.toHaveBeenCalled();
    await verifyOnboardingOrchestrator('saved-agent', 'workspace-one');
    expect(api.preference).toHaveBeenCalledTimes(1);
    expect(api.preference).toHaveBeenCalledWith({ orchestratorAgentId: 'saved-agent' });
  });
  it('does not mark finished when saving the default fails', async () => {
    api.preference.mockRejectedValueOnce(new Error('save failed'));
    const finish = vi.fn();
    const navigate = vi.fn();
    await expect(
      finishOnboardingAndNavigate(finish, navigate, () =>
        verifyOnboardingOrchestrator('saved-agent', 'workspace-one'),
      ),
    ).rejects.toThrow('save failed');
    expect(finish).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

it('rejects a private first Agent, then finishes with an explicitly selected public source', async () => {
  const privateAgent = { id: 'first-private', visibility: 'private' };
  api.runtime.mockImplementation(async ({ agentId, visibility }) => {
    if (agentId === privateAgent.id && visibility === 'public')
      throw new Error('ORCHESTRATOR_SOURCE_PRIVATE');
    return {
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'public-device',
        heterogeneousProvider: { type: 'codex' },
      },
    };
  });
  api.devices.mockResolvedValue([
    { deviceId: 'public-device', online: true, scope: 'workspace', visibility: 'public' },
  ]);
  api.scan.mockResolvedValue({ agents: { codex: { available: true } } });
  const finish = vi.fn();
  const navigate = vi.fn();
  await expect(
    finishOnboardingAndNavigate(
      finish,
      navigate,
      () => verifyOnboardingOrchestrator(privateAgent.id, 'workspace-one'),
      privateAgent.id,
    ),
  ).rejects.toThrow('ORCHESTRATOR_SOURCE_PRIVATE');
  expect(finish).not.toHaveBeenCalled();
  expect(api.preference).not.toHaveBeenCalled();
  await finishOnboardingAndNavigate(
    finish,
    navigate,
    () => verifyOnboardingOrchestrator('public-source', 'workspace-one'),
    privateAgent.id,
  );
  expect(api.preference).toHaveBeenCalledWith({ orchestratorAgentId: 'public-source' });
  expect(finish).toHaveBeenCalledOnce();
  expect(privateAgent.visibility).toBe('private');
});
