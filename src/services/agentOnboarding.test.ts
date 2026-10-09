import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOnboardingAgentOnce,
  ensureFirstAgentInWorkspace,
  type FirstAgentProviderCheckpoint,
  firstPrimeAgentConfig,
  prepareFirstAgentProvider,
  verifyFirstAgentDevice,
} from './agentOnboarding';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  createBinding: vi.fn(),
  updateBinding: vi.fn(),
  check: vi.fn(),
  listWorkspace: vi.fn(),
  transfer: vi.fn(),
  devices: vi.fn(),
  preference: vi.fn(),
  config: vi.fn(),
  sidebar: vi.fn(),
  listBindings: vi.fn(),
}));
vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: () => ({
    home: { getSidebarAgentList: { query: api.listWorkspace } },
    workspaceUserSettings: { updatePreference: { mutate: api.preference } },
    agent: { getAgentConfigById: { query: api.config } },
  }),
  lambdaClient: {
    creds: {
      createKV: { mutate: api.create },
      update: { mutate: api.update },
    },
  },
}));
vi.mock('./agent', () => ({
  agentService: { transferAgent: api.transfer, getAgentConfigById: api.config },
}));
vi.mock('./home', () => ({ homeService: { getSidebarAgentList: api.sidebar } }));
vi.mock('./device', () => ({ deviceService: { listDevices: api.devices } }));
vi.mock('./providerBinding', () => ({
  providerBindingService: {
    list: api.listBindings,
    create: api.createBinding,
    update: api.updateBinding,
    checkConnection: api.check,
  },
}));

const input = {
  apiKey: 'test-secret',
  endpoint: 'https://provider.example/v1',
  model: 'real-model',
};
beforeEach(() => {
  vi.resetAllMocks();
  api.create.mockResolvedValue({ data: { id: 'cred_new' } });
  api.createBinding.mockResolvedValue({ data: { id: 'binding', revision: 1 } });
  api.updateBinding.mockResolvedValue({ data: { id: 'binding', revision: 2 } });
  api.check.mockResolvedValue({ status: 'ready' });
  api.config.mockResolvedValue({
    id: 'first-agent',
    agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
  });
  api.listBindings.mockResolvedValue({ data: [] });
  api.devices.mockResolvedValue([{ deviceId: 'chosen-device', online: true, scope: 'personal' }]);
  api.listWorkspace.mockResolvedValue({
    pinned: [],
    ungrouped: [],
    groups: [],
    privatePinned: [],
    privateUngrouped: [],
    privateGroups: [],
  });
  api.transfer.mockImplementation(async () => {
    api.config.mockResolvedValue({
      id: 'first-agent',
      workspaceId: 'new-workspace',
      visibility: 'private',
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
    });
  });
});

const chosenHost = { executionTarget: 'device' as const, boundDeviceId: 'chosen-device' };

describe('first agent workspace checkpoint', () => {
  it('does not mistake a personal row in the workspace sidebar for workspace ownership', async () => {
    api.listWorkspace.mockResolvedValue({
      pinned: [{ id: 'first-agent' }],
      ungrouped: [],
      groups: [],
      privatePinned: [],
      privateUngrouped: [],
      privateGroups: [],
    });
    await ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost);
    expect(api.transfer).toHaveBeenCalledWith('first-agent', 'new-workspace', 'private');
  });
  it('moves the same agent privately and reuses it after reload or retry', async () => {
    await ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost);
    expect(api.transfer).toHaveBeenCalledWith('first-agent', 'new-workspace', 'private');
    api.listWorkspace.mockResolvedValue({
      pinned: [],
      ungrouped: [],
      groups: [],
      privatePinned: [{ id: 'first-agent' }],
      privateUngrouped: [],
      privateGroups: [],
    });
    await ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost);
    expect(api.transfer).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.preference).toHaveBeenCalledWith({
      agentDeviceOverrides: {
        'first-agent': { executionTarget: 'device', boundDeviceId: 'chosen-device' },
      },
    });
  });
  it('propagates a failed private transfer so onboarding cannot finish', async () => {
    api.transfer.mockRejectedValue(new Error('transfer failed'));
    await expect(
      ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost),
    ).rejects.toThrow('transfer failed');
  });
  it('requires the saved row to confirm the private workspace before completing', async () => {
    api.transfer.mockResolvedValue(undefined);
    await expect(
      ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost),
    ).rejects.toThrow('FIRST_AGENT_WORKSPACE_REQUIRED');
    expect(api.preference).not.toHaveBeenCalled();
  });
  it('rejects a missing, offline or unauthorized device before transferring or writing preferences', async () => {
    api.devices.mockResolvedValue([
      { deviceId: 'chosen-device', online: false, scope: 'personal' },
    ]);
    await expect(
      ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost),
    ).rejects.toThrow('FIRST_AGENT_DEVICE_REQUIRED');
    expect(api.transfer).not.toHaveBeenCalled();
    expect(api.preference).not.toHaveBeenCalled();
    await expect(verifyFirstAgentDevice('invented-device')).rejects.toThrow(
      'FIRST_AGENT_DEVICE_REQUIRED',
    );
  });
  it('creates Prime with the explicitly chosen real device rather than an unset or hosted target', () => {
    expect(firstPrimeAgentConfig('real-model', 'chosen-device')).toEqual({
      title: 'Orvilo AI',
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'chosen-device',
        heterogeneousProvider: { type: 'orvilo', model: 'real-model' },
      },
    });
  });
  it('preserves a supported local CLI profile without requiring a gateway device', async () => {
    api.devices.mockResolvedValue([]);
    await ensureFirstAgentInWorkspace('first-agent', 'new-workspace', { executionTarget: 'local' });
    expect(api.devices).not.toHaveBeenCalled();
    expect(api.preference).toHaveBeenCalledWith({
      agentDeviceOverrides: { 'first-agent': { executionTarget: 'local' } },
    });
  });
  it('rejects an unsupported local Prime target and a missing verified model route before completion', async () => {
    api.config.mockResolvedValue({
      id: 'first-agent',
      agencyConfig: { heterogeneousProvider: { type: 'orvilo', model: 'selected-model' } },
    });
    await expect(
      ensureFirstAgentInWorkspace('first-agent', 'new-workspace', { executionTarget: 'local' }),
    ).rejects.toThrow('FIRST_AGENT_DEVICE_REQUIRED');
    await expect(
      ensureFirstAgentInWorkspace('first-agent', 'new-workspace', chosenHost),
    ).rejects.toThrow('PROVIDER_CHECK_UNAVAILABLE');
    expect(api.transfer).not.toHaveBeenCalled();
    expect(api.preference).not.toHaveBeenCalled();
  });
});

describe('first agent create response reconciliation', () => {
  it('reuses the committed row and its actual host after the response is lost', async () => {
    const checkpoint = { requestId: 'intent-1' };
    const original = { config: firstPrimeAgentConfig('model', 'original-device') };
    const create = vi.fn(async (params) => {
      api.sidebar.mockResolvedValue({
        pinned: [{ id: 'created-once' }],
        ungrouped: [],
        groups: [],
        privatePinned: [],
        privateUngrouped: [],
        privateGroups: [],
      });
      api.config.mockResolvedValue({ ...params.config, id: 'created-once' });
      throw new Error('response lost after insert');
    });
    await expect(createOnboardingAgentOnce(checkpoint, original, create)).rejects.toThrow(
      'response lost',
    );
    const resumed = await createOnboardingAgentOnce(
      checkpoint,
      { config: firstPrimeAgentConfig('model', 'new-device') },
      create,
    );
    expect(resumed.agentId).toBe('created-once');
    expect(resumed.config?.agencyConfig?.boundDeviceId).toBe('original-device');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('does not retry creation when the authoritative reconciliation request fails', async () => {
    api.sidebar.mockRejectedValue(new Error('cannot confirm existing rows'));
    const create = vi.fn();
    await expect(
      createOnboardingAgentOnce({ requestId: 'intent-1', attempted: true }, {}, create),
    ).rejects.toThrow('cannot confirm existing rows');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('first agent API setup', () => {
  it('saves a new personal encrypted credential, then verifies its Prime binding', async () => {
    await prepareFirstAgentProvider(input, {});
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'kv-env', values: { API_KEY: 'test-secret' } }),
    );
    expect(api.createBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        model: 'real-model',
        secretReference: 'credential:cred_new',
        selection: expect.objectContaining({ runtime: 'orvilo', target: 'sandbox' }),
      }),
    );
    expect(api.check).toHaveBeenCalledWith('binding', 1);
  });

  it('reuses new records and lets a rejected key be corrected on retry', async () => {
    const checkpoint: FirstAgentProviderCheckpoint = {};
    api.check.mockResolvedValueOnce({ status: 'unavailable' });
    await expect(prepareFirstAgentProvider(input, checkpoint)).rejects.toThrow(
      'PROVIDER_CHECK_UNAVAILABLE',
    );
    await prepareFirstAgentProvider({ ...input, apiKey: 'corrected-secret' }, checkpoint);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.createBinding).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith({
      id: 'cred_new',
      values: { API_KEY: 'corrected-secret' },
    });
    expect(api.check).toHaveBeenLastCalledWith('binding', 2);
  });

  it('does not save credentials for an invalid execution endpoint', async () => {
    await expect(
      prepareFirstAgentProvider({ ...input, endpoint: 'http://provider.example/v1' }, {}),
    ).rejects.toThrow();
    expect(api.create).not.toHaveBeenCalled();
  });
});

it('resumes a public-source create in its target workspace after a lost response', async () => {
  const checkpoint = { requestId: 'public-intent' };
  const create = vi.fn().mockImplementation(async (params) => {
    api.listWorkspace.mockResolvedValue({
      pinned: [],
      groups: [],
      ungrouped: [{ id: 'public-source' }],
      privatePinned: [],
      privateUngrouped: [],
      privateGroups: [],
    });
    api.config.mockResolvedValue({
      ...params.config,
      id: 'public-source',
      workspaceId: 'new-workspace',
      visibility: 'public',
    });
    throw new Error('response lost');
  });
  const params = {
    workspaceId: 'new-workspace',
    visibility: 'public' as const,
    config: firstPrimeAgentConfig('model', 'public-device'),
  };
  await expect(createOnboardingAgentOnce(checkpoint, params, create)).rejects.toThrow(
    'response lost',
  );
  api.sidebar.mockRejectedValue(new Error('wrong active scope'));
  const resumed = await createOnboardingAgentOnce(checkpoint, params, create);
  expect(resumed.agentId).toBe('public-source');
  expect(resumed.config?.visibility).toBe('public');
  expect(create).toHaveBeenCalledOnce();
});
